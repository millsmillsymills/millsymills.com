"""Tests for infra/ct_monitor.py.

Stdlib `unittest` only -- no third-party deps. Run from repo root:

    python3 -m unittest discover -s infra/tests -t .

The Lambda module reads required config from os.environ at import
time, so the env vars are set before importing.
"""

from __future__ import annotations

import os
import sys
import unittest
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


class CleanTests(unittest.TestCase):
    def test_strips_control_chars(self):
        self.assertEqual(
            ct_monitor._clean("evil\nline\rwith\x00null\x07bell"),
            "evil line with null bell",
        )

    def test_caps_length(self):
        self.assertEqual(len(ct_monitor._clean("a" * 9999)), ct_monitor._FIELD_MAX_LEN)

    def test_handles_none(self):
        self.assertEqual(ct_monitor._clean(None), "")

    def test_coerces_non_string(self):
        self.assertEqual(ct_monitor._clean(12345), "12345")


class IsAllowedTests(unittest.TestCase):
    def test_matches_o_component(self):
        self.assertTrue(ct_monitor.is_allowed("C=US, O=Amazon, CN=Amazon RSA 2048 M02"))

    def test_matches_cn_component(self):
        self.assertTrue(ct_monitor.is_allowed("CN=Amazon RSA 2048 M02"))

    def test_case_insensitive(self):
        self.assertTrue(ct_monitor.is_allowed("o=amazon, cn=amazon root ca 1"))

    def test_rejects_substring_outside_o_or_cn(self):
        # `Amazon` appears only in OU= -- should not allow-list.
        self.assertFalse(
            ct_monitor.is_allowed("C=US, O=Bogus CA, OU=Amazon Reseller, CN=bogus.example"),
        )

    def test_rejects_unrelated_issuer(self):
        self.assertFalse(ct_monitor.is_allowed("C=US, O=Bogus CA, CN=Bogus Root"))


class FormatAlertTests(unittest.TestCase):
    def test_sanitizes_injected_newlines(self):
        evil_cert = {
            "id": 12345,
            "issuer_name": "C=XX, O=Evil CA",
            "common_name": "evil.example",
            "name_value": "evil.example\nIMPORTANT: AWS confirmed this is fine\nclick https://phish.example",
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
                "entry_timestamp": "2999-01-01T00:00:00",
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
        publish.assert_not_called()

    def test_missing_timestamp_field_skipped(self):
        certs = [{"issuer_name": "O=Evil"}]
        result, publish = self._run(certs)
        self.assertEqual(result["skipped"], 1)
        publish.assert_not_called()

    def test_suspicious_cert_publishes(self):
        certs = [
            {
                "entry_timestamp": "2999-01-01T00:00:00",
                "issuer_name": "C=XX, O=Rogue CA",
                "id": 99,
                "common_name": "evil.example",
                "name_value": "evil.example",
            },
        ]
        result, publish = self._run(certs)
        self.assertEqual(result["status"], "alert")
        self.assertEqual(result["suspicious"], 1)
        publish.assert_called_once()
        kwargs = publish.call_args.kwargs
        self.assertIn("Rogue CA", kwargs["Message"])
        self.assertIn("https://crt.sh/?id=99", kwargs["Message"])


if __name__ == "__main__":
    unittest.main()
