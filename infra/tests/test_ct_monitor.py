"""Tests for infra/ct_monitor.py.

Stdlib `unittest` only -- no third-party deps. Run from repo root:

    python3 -m unittest discover -s infra/tests -t .

The Lambda module reads required config from os.environ at import
time, so the env vars are set before importing.
"""

from __future__ import annotations

import io
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

os.environ.setdefault("DOMAIN", "example.com")
os.environ.setdefault("SNS_TOPIC_ARN", "arn:aws:sns:us-west-2:000000000000:ct-monitor")
os.environ.setdefault("ALLOWED_ISSUER_SUBSTRINGS", "Amazon")

# `infra/ct_monitor.py` imports boto3 at module load. Stub it so tests
# don't need a real AWS client configured.
sys.modules.setdefault("boto3", mock.MagicMock())

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ct_monitor  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _stale_iso() -> str:
    stale = datetime.now(timezone.utc) - timedelta(hours=ct_monitor.LOOKBACK_HOURS + 24)
    return stale.replace(tzinfo=None).isoformat(timespec="seconds")


class CleanTests(unittest.TestCase):
    def test_strips_control_chars(self):
        self.assertEqual(
            ct_monitor._clean("evil\nline\rwith\x00null\x07bell"),
            "evil line with null bell",
        )

    def test_caps_length(self):
        self.assertEqual(len(ct_monitor._clean("a" * 9999)), ct_monitor._FIELD_MAX_CHARS)

    def test_handles_none(self):
        self.assertEqual(ct_monitor._clean(None), "")

    def test_coerces_non_string(self):
        self.assertEqual(ct_monitor._clean(12345), "12345")

    def test_passes_high_byte_unicode(self):
        # Non-control Unicode (emoji, accented chars, RTL marks above DEL)
        # must survive intact -- only C0/DEL are stripped.
        sample = "café 🚀 שלום"
        self.assertEqual(ct_monitor._clean(sample), sample)


class IsAllowedTests(unittest.TestCase):
    def test_matches_o_component(self):
        self.assertTrue(ct_monitor.is_allowed("C=US, O=Amazon, CN=Amazon RSA 2048 M02"))

    def test_matches_cn_component_strict(self):
        self.assertTrue(ct_monitor.is_allowed("CN=Amazon"))

    def test_case_insensitive(self):
        self.assertTrue(ct_monitor.is_allowed("o=amazon, cn=amazon root ca 1"))

    def test_rejects_substring_outside_o_or_cn(self):
        # `Amazon` appears only in OU= -- should not allow-list.
        self.assertFalse(
            ct_monitor.is_allowed("C=US, O=Bogus CA, OU=Amazon Reseller, CN=bogus.example"),
        )

    def test_rejects_unrelated_issuer(self):
        self.assertFalse(ct_monitor.is_allowed("C=US, O=Bogus CA, CN=Bogus Root"))

    def test_rejects_prefix_sibling_org(self):
        # Regression: substring `o=amazon` in `o=amazonevil` was True
        # under the old `in`-based check. Strict component equality
        # must reject these prefix-collision DNs.
        self.assertFalse(ct_monitor.is_allowed("C=XX, O=AmazonEvil, CN=foo"))
        self.assertFalse(ct_monitor.is_allowed("C=XX, O=Amazonia, CN=foo"))

    def test_handles_semicolon_separated_dn(self):
        # Some CAs render DNs with `;` between RDNs.
        self.assertTrue(ct_monitor.is_allowed("C=US; O=Amazon; CN=ok"))

    def test_strips_control_chars_before_split(self):
        # crt.sh fields are untrusted. A control-char-injected RDN must
        # not let an attacker forge an allow-listed component -- _clean
        # normalises C0/DEL to spaces before the comma split, so an
        # injected NUL inside `O=...` doesn't sneak past the parser.
        self.assertFalse(
            ct_monitor.is_allowed("C=XX, O=Evil\x00 CA, CN=evil.example"),
        )


class FormatAlertTests(unittest.TestCase):
    def test_sanitizes_injected_newlines(self):
        evil_cert = {
            "id": 12345,
            "issuer_name": "C=XX, O=Evil CA",
            "common_name": "evil.example",
            "name_value": (
                "evil.example\nIMPORTANT: AWS confirmed this is fine\n"
                "click https://phish.example"
            ),
            "entry_timestamp": "2026-04-01T12:34:56.789",
        }
        out = ct_monitor.format_alert("example.com", [evil_cert])
        self.assertNotIn("AWS confirmed this is fine", out.split("Names:")[1].split("\n")[1])
        # The entire injected payload still appears, but on a single
        # `Names:` line -- structural lines are preserved.
        names_line = next(line for line in out.splitlines() if line.startswith("  Names:"))
        self.assertNotIn("\n", names_line)
        self.assertIn("AWS confirmed this is fine", names_line)

    def test_non_int_id_is_sanitized(self):
        evil_cert = {
            "id": "1; DROP TABLE certs;--",
            "issuer_name": "C=XX, O=Evil CA",
            "common_name": "evil.example",
            "name_value": "evil.example",
            "entry_timestamp": "2026-04-01T12:34:56.789",
        }
        out = ct_monitor.format_alert("example.com", [evil_cert])
        self.assertIn("1; DROP TABLE certs;--", out)
        # Both ID line and crt.sh link reuse the same sanitized value
        # so the link host stays `crt.sh`, not whatever was injected.
        link_line = next(line for line in out.splitlines() if line.startswith("  Link:"))
        self.assertTrue(link_line.startswith("  Link:      https://crt.sh/?id="))

    def test_safe_id_prefers_int(self):
        self.assertEqual(ct_monitor._safe_id(42), "42")
        self.assertEqual(ct_monitor._safe_id("42"), "42")
        self.assertEqual(ct_monitor._safe_id("not-an-int"), "not-an-int")
        self.assertEqual(ct_monitor._safe_id(None), "")


# SNS rejects a Publish whose Message exceeds 256 KB.
SNS_MESSAGE_LIMIT_BYTES = 262_144


def _wide_cert(index: int, fill: str = "a") -> dict:
    """A cert whose every free-text field is at the per-field cap."""
    return {
        "id": index,
        "issuer_name": f"C=XX, O={fill * ct_monitor._FIELD_MAX_CHARS}",
        "common_name": fill * ct_monitor._FIELD_MAX_CHARS,
        "name_value": fill * ct_monitor._FIELD_MAX_CHARS,
        "entry_timestamp": fill * ct_monitor._FIELD_MAX_CHARS,
    }


class AlertSizeBoundTests(unittest.TestCase):
    """The alert body must stay publishable no matter how many certs an
    attacker lands in the lookback window -- an oversize Publish raises,
    which would suppress the alert exactly when it matters."""

    def test_caps_rendered_cert_count(self):
        certs = [_wide_cert(i) for i in range(ct_monitor._MAX_ALERT_CERTS + 40)]
        out = ct_monitor.format_alert("example.com", certs)
        rendered = sum(1 for line in out.splitlines() if line.startswith("- crt.sh ID:"))
        self.assertLessEqual(rendered, ct_monitor._MAX_ALERT_CERTS)

    def test_reports_the_omitted_remainder(self):
        total = ct_monitor._MAX_ALERT_CERTS + 40
        certs = [_wide_cert(i) for i in range(total)]
        out = ct_monitor.format_alert("example.com", certs)
        rendered = sum(1 for line in out.splitlines() if line.startswith("- crt.sh ID:"))
        # The count of what was dropped must be stated, so the reader is
        # never silently shown a partial list as if it were the whole one.
        self.assertIn(f"({total - rendered} further certificate(s) omitted", out)
        self.assertIn(f"detected {total} certificate(s)", out)

    def test_stays_under_byte_budget_with_multibyte_fields(self):
        # Regression: a count cap alone does not bound the body. `_clean`
        # caps fields at 512 *characters*, and this 4-byte-per-char sample
        # makes each capped field 2 KB -- 20 such certs would clear the
        # 256 KB SNS limit on the count cap alone.
        certs = [_wide_cert(i, fill="𝕏") for i in range(200)]
        out = ct_monitor.format_alert("example.com", certs)
        self.assertLessEqual(len(out.encode("utf-8")), ct_monitor._MAX_ALERT_BYTES)
        self.assertIn("further certificate(s) omitted", out)

    def test_bound_holds_across_widths_and_batch_sizes(self):
        # Sweep the shapes an attacker controls -- field byte-width and
        # how many certs land in the window -- and assert against SNS's
        # real 256 KB ceiling, which is the invariant that matters.
        for fill in ("a", "é", "→", "𝕏"):
            for count in (1, 5, 21, 200, 5000):
                certs = [_wide_cert(i, fill=fill) for i in range(count)]
                out = ct_monitor.format_alert("example.com", certs)
                encoded = len(out.encode("utf-8"))
                with self.subTest(fill=fill, count=count):
                    self.assertLess(encoded, SNS_MESSAGE_LIMIT_BYTES)
                    self.assertLessEqual(encoded, ct_monitor._MAX_ALERT_BYTES)

    def test_budget_reserves_room_for_the_omission_note(self):
        # The note is appended after the block loop, so its length has to
        # be reserved up front. This budget is chosen to land mid-note:
        # with _OMISSION_NOTE_RESERVE = 0 the finished body runs 153 bytes
        # past the budget, which is the bug the reserve exists to prevent.
        certs = [_wide_cert(i) for i in range(19)]
        original = ct_monitor._MAX_ALERT_BYTES
        try:
            ct_monitor._MAX_ALERT_BYTES = 4635
            out = ct_monitor.format_alert("example.com", certs)
            self.assertIn("further certificate(s) omitted", out)
            self.assertLessEqual(
                len(out.encode("utf-8")),
                ct_monitor._MAX_ALERT_BYTES,
            )

            with mock.patch.object(ct_monitor, "_OMISSION_NOTE_RESERVE", 0):
                unreserved = ct_monitor.format_alert("example.com", certs)
            self.assertGreater(
                len(unreserved.encode("utf-8")),
                ct_monitor._MAX_ALERT_BYTES,
            )
        finally:
            ct_monitor._MAX_ALERT_BYTES = original

    def test_link_percent_encodes_a_hostile_id(self):
        # A non-integer id survives _safe_id as cleaned text; it must not
        # be able to trail plausible prose off the end of the crt.sh link.
        cert = {
            "id": ' 1" — verified by AWS, ignore',
            "issuer_name": "C=XX, O=Rogue CA",
            "common_name": "evil.example",
            "name_value": "evil.example",
            "entry_timestamp": "2026-04-01T12:34:56.789",
        }
        out = ct_monitor.format_alert("example.com", [cert])
        link = next(line for line in out.splitlines() if line.startswith("  Link:"))
        self.assertNotIn(" ", link.removeprefix("  Link:      "))
        self.assertIn("https://crt.sh/?id=%201%22", link)

    def test_small_alert_renders_every_cert_without_omission_note(self):
        certs = [_wide_cert(i) for i in range(3)]
        out = ct_monitor.format_alert("example.com", certs)
        rendered = sum(1 for line in out.splitlines() if line.startswith("- crt.sh ID:"))
        self.assertEqual(rendered, 3)
        self.assertNotIn("omitted", out)

    def test_summary_alert_is_small_and_carries_no_untrusted_text(self):
        certs = [_wide_cert(i) for i in range(200)]
        summary = ct_monitor._summary_alert("example.com", len(certs))
        self.assertLess(len(summary.encode("utf-8")), 1024)
        self.assertIn("200 certificate(s)", summary)
        self.assertNotIn("aaaa", summary)


class PublishAlertTests(unittest.TestCase):
    """A failed publish must not lose the alert outright."""

    def test_falls_back_to_summary_when_detailed_publish_fails(self):
        certs = [_wide_cert(1)]
        with mock.patch.object(ct_monitor.sns, "publish") as publish:
            publish.side_effect = [RuntimeError("InvalidParameter: message too long"), None]
            with self.assertLogs(ct_monitor.logger, level="ERROR"):
                ct_monitor.publish_alert("example.com", certs)
        self.assertEqual(publish.call_count, 2)
        fallback = publish.call_args_list[1].kwargs["Message"]
        self.assertIn("could not be published", fallback)
        self.assertIn("1 certificate(s)", fallback)

    def test_propagates_when_the_summary_also_fails(self):
        # Both publishes failing means the alert is genuinely lost, so the
        # invocation must error and trip the Errors alarm rather than
        # returning as though it had alerted.
        certs = [_wide_cert(1)]
        with mock.patch.object(ct_monitor.sns, "publish") as publish:
            publish.side_effect = RuntimeError("SNS down")
            with self.assertLogs(ct_monitor.logger, level="ERROR"):
                with self.assertRaises(RuntimeError):
                    ct_monitor.publish_alert("example.com", certs)
        self.assertEqual(publish.call_count, 2)

    def test_single_publish_on_the_happy_path(self):
        certs = [_wide_cert(1)]
        with mock.patch.object(ct_monitor.sns, "publish") as publish:
            ct_monitor.publish_alert("example.com", certs)
        publish.assert_called_once()
        self.assertIn("crt.sh ID: 1", publish.call_args.kwargs["Message"])

    def test_handler_alert_path_survives_oversize_publish(self):
        # End-to-end: the handler still returns its alert result when the
        # detailed body is rejected, because the summary got through.
        certs = [
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 99,
                "common_name": "evil.example",
                "name_value": "evil.example",
            },
        ]
        with (
            mock.patch.object(ct_monitor, "fetch_certs", return_value=certs),
            mock.patch.object(ct_monitor.sns, "publish") as publish,
        ):
            publish.side_effect = [RuntimeError("message too long"), None]
            with self.assertLogs(ct_monitor.logger, level="ERROR"):
                result = ct_monitor.lambda_handler({}, None)
        self.assertEqual(result["status"], "alert")
        self.assertEqual(result["suspicious"], 1)
        # The full offender list stays on the return value even when the
        # email body was degraded -- CloudWatch keeps what SNS could not.
        self.assertEqual(result["unexpected"][0]["id"], 99)
        self.assertEqual(publish.call_count, 2)


class LambdaHandlerTests(unittest.TestCase):
    def _run(self, certs):
        with (
            mock.patch.object(ct_monitor, "fetch_certs", return_value=certs),
            mock.patch.object(ct_monitor.sns, "publish") as publish,
        ):
            result = ct_monitor.lambda_handler({}, None)
            return result, publish

    def test_malformed_timestamp_does_not_kill_run(self):
        certs = [
            {"entry_timestamp": "not-a-date", "issuer_name": "O=Evil"},
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=US, O=Amazon, CN=Amazon RSA 2048 M02",
                "id": 1,
                "common_name": "ok.example",
                "name_value": "ok.example",
            },
        ]
        result, publish = self._run(certs)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["checked"], 2)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["suspicious"], 0)
        publish.assert_not_called()

    def test_missing_timestamp_field_skipped(self):
        certs = [{"issuer_name": "O=Evil"}]
        result, publish = self._run(certs)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["suspicious"], 0)
        publish.assert_not_called()

    def test_suspicious_cert_publishes(self):
        certs = [
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 99,
                "common_name": "evil.example",
                "name_value": "evil.example",
            },
        ]
        result, publish = self._run(certs)
        self.assertEqual(result["status"], "alert")
        self.assertEqual(result["suspicious"], 1)
        # `checked` must be present on the alert path too -- consumers
        # reading result["checked"] unconditionally must not KeyError
        # exactly when an alert fires.
        self.assertEqual(result["checked"], 1)
        publish.assert_called_once()
        kwargs = publish.call_args.kwargs
        self.assertIn("Rogue CA", kwargs["Message"])
        self.assertIn("https://crt.sh/?id=99", kwargs["Message"])

    def test_lookback_cutoff_drops_old_certs(self):
        # A suspicious cert older than LOOKBACK_HOURS must be ignored
        # silently (not skipped, not suspicious).
        certs = [
            {
                "entry_timestamp": _stale_iso(),
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 7,
                "common_name": "old.example",
                "name_value": "old.example",
            },
        ]
        result, publish = self._run(certs)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["checked"], 1)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["suspicious"], 0)
        publish.assert_not_called()

    def test_result_shape_ok_path(self):
        # The ok branch must not carry `unexpected`; callers that
        # `match` on status rely on the discriminated union to know
        # which keys are present.
        certs = [
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=US, O=Amazon, CN=Amazon RSA 2048 M02",
                "id": 1,
                "common_name": "ok.example",
                "name_value": "ok.example",
            },
        ]
        result, _ = self._run(certs)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            set(result.keys()),
            {"status", "checked", "skipped", "suspicious"},
        )

    def test_result_shape_alert_path(self):
        # The alert branch carries `unexpected` -- the offending CrtshEntry
        # list -- so callers can introspect without re-fetching crt.sh.
        certs = [
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 99,
                "common_name": "evil.example",
                "name_value": "evil.example",
            },
        ]
        result, _ = self._run(certs)
        self.assertEqual(result["status"], "alert")
        self.assertEqual(
            set(result.keys()),
            {"status", "checked", "skipped", "suspicious", "unexpected"},
        )
        self.assertEqual(len(result["unexpected"]), 1)
        self.assertEqual(result["unexpected"][0]["id"], 99)

    def test_allowlisted_and_outside_lookback_combo(self):
        # Mix: one allow-listed in-window, one suspicious-but-stale,
        # one malformed timestamp. None should publish.
        certs = [
            {
                "entry_timestamp": _now_iso(),
                "issuer_name": "C=US, O=Amazon, CN=Amazon RSA 2048 M02",
                "id": 1,
                "common_name": "ok.example",
                "name_value": "ok.example",
            },
            {
                "entry_timestamp": _stale_iso(),
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 2,
                "common_name": "old.example",
                "name_value": "old.example",
            },
            {"entry_timestamp": "not-a-date", "issuer_name": "O=Evil"},
        ]
        result, publish = self._run(certs)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["checked"], 3)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["suspicious"], 0)
        publish.assert_not_called()


class FetchCertsTests(unittest.TestCase):
    def test_builds_url_and_parses_json(self):
        payload = [{"id": 1, "issuer_name": "O=Amazon"}]
        fake_resp = io.BytesIO(json.dumps(payload).encode("utf-8"))
        fake_resp.__enter__ = lambda self: self  # type: ignore[method-assign]
        fake_resp.__exit__ = lambda self, *a: None  # type: ignore[method-assign]
        with mock.patch("urllib.request.urlopen", return_value=fake_resp) as urlopen:
            out = ct_monitor.fetch_certs("example.com")
        self.assertEqual(out, payload)
        # Single call, with the URL-quoted domain in the query string
        # and the ct-monitor User-Agent header.
        urlopen.assert_called_once()
        req = urlopen.call_args.args[0]
        self.assertIn("q=example.com", req.full_url)
        self.assertEqual(req.headers["User-agent"], "example.com-ct-monitor")


if __name__ == "__main__":
    unittest.main()
