"""CT log monitor.

Polls crt.sh for certs naming $DOMAIN and publishes an SNS alert
whenever a cert appears whose issuer is not in the allow-list.

Pairs with the CAA records in `caa.tf`: CAA prevents most mis-issuance
at the CA, this catches anything that slips through (rogue CA, account
compromise, legit-but-unexpected issuance).

Stateless. A cert older than $LOOKBACK_HOURS is ignored, so each
suspicious cert can alert at most ceil(LOOKBACK_HOURS / 24) times
before aging out. With the default 48h lookback and 24h schedule,
that's two alerts per cert. Acceptable: in steady state we expect
zero alerts ever.

Treats every crt.sh field as untrusted. crt.sh aggregates from
third-party CT logs and anyone able to get a CA-signed cert into a
log can place arbitrary bytes in `subject` / `name_value`. Control
chars are stripped and lengths are capped before fields land in the
SNS email body, otherwise an attacker could inject newlines + plausible
"AWS confirmation" verbiage to mask the real findings.

The assembled body is bounded too, in both cert count and encoded bytes:
SNS rejects a Publish over 256 KB, so an unbounded body would let mass
mis-issuance suppress the very alert that reports it. If a publish fails
anyway, the alert degrades to a count-only summary rather than being lost.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, TypedDict, Union

import boto3

DOMAIN = os.environ["DOMAIN"]
SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
ALLOWED_ISSUER_SUBSTRINGS = [
    s.strip() for s in os.environ["ALLOWED_ISSUER_SUBSTRINGS"].split(",") if s.strip()
]
LOOKBACK_HOURS = int(os.environ.get("LOOKBACK_HOURS", "48"))

CRTSH_URL = "https://crt.sh/?q={query}&output=json"
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_FIELD_MAX_CHARS = 512
_DN_SPLIT = re.compile(r"[,;]")

# How many cert blocks the alert body renders. Enough detail to triage
# from the email; the full list is always in the handler's return value,
# which Lambda logs to CloudWatch.
_MAX_ALERT_CERTS = 20

# SNS rejects a Publish over 256 KB. `_clean` caps each field at
# _FIELD_MAX_CHARS *characters* and a UTF-8 character can be 4 bytes, so
# _MAX_ALERT_CERTS alone does not bound the encoded size -- 20 blocks of
# six maximally-wide fields would clear 256 KB on its own. Budget the
# real encoded length instead, with headroom for the Subject and SNS
# envelope.
_MAX_ALERT_BYTES = 200_000

logger = logging.getLogger(__name__)

sns = boto3.client("sns")


class CrtshEntry(TypedDict, total=False):
    id: int | str
    entry_timestamp: str
    issuer_name: str
    common_name: str
    name_value: str


class CtOk(TypedDict):
    status: Literal["ok"]
    checked: int
    skipped: int
    suspicious: int


class CtAlert(TypedDict):
    status: Literal["alert"]
    checked: int
    skipped: int
    suspicious: int
    unexpected: list[CrtshEntry]


CtResult = Union[CtOk, CtAlert]


def _clean(value: object) -> str:
    """Strip C0/DEL control chars and cap length so a single field
    cannot inject newlines or overflow the SNS body. crt.sh fields are
    intrinsically untrusted -- see module docstring."""
    return _CONTROL_CHARS.sub(" ", str(value or ""))[:_FIELD_MAX_CHARS]


def fetch_certs(domain: str) -> list[CrtshEntry]:
    url = CRTSH_URL.format(query=urllib.parse.quote(domain))
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"{domain}-ct-monitor"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (fixed scheme)
        return json.loads(resp.read().decode("utf-8"))


def is_allowed(issuer: str) -> bool:
    """Match the allow-list against the `O=` or `CN=` component of the
    DN, with strict equality on the component value -- not free
    substring matching. Substring matching would silently allow-list
    `O=AmazonEvil` or `O=Amazonia` once `Amazon` is on the list, since
    `\"o=amazon\" in \"o=amazonevil...\"` is true. Strict component
    equality avoids that.

    The DN is run through `_clean` first so a control-char-injected
    RDN (e.g. `O=Bad\\x00, CN=Amazon`) can't smuggle a fake comma past
    the split and forge an allow-listed component."""
    needles = {s.lower() for s in ALLOWED_ISSUER_SUBSTRINGS}
    for raw in _DN_SPLIT.split(_clean(issuer)):
        component = raw.strip().lower()
        if "=" not in component:
            continue
        key, _, value = component.partition("=")
        if key.strip() in {"o", "cn"} and value.strip() in needles:
            return True
    return False


def lambda_handler(event: dict[str, Any], context: object) -> CtResult:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)

    certs = fetch_certs(DOMAIN)
    suspicious: list[CrtshEntry] = []
    skipped = 0
    for cert in certs:
        # crt.sh entry_timestamp is naive UTC ISO-8601, e.g. "2026-04-01T12:34:56.789".
        # Wrap in try/except so a single malformed entry can't kill the run -- the
        # monitor is the post-issuance safety net for CAA, silencing it has impact.
        try:
            entry_ts = datetime.fromisoformat(cert["entry_timestamp"]).replace(
                tzinfo=timezone.utc,
            )
        except (KeyError, TypeError, ValueError):
            skipped += 1
            continue
        if entry_ts < cutoff:
            continue
        if not is_allowed(cert.get("issuer_name", "")):
            suspicious.append(cert)

    if not suspicious:
        ok: CtOk = {
            "status": "ok",
            "checked": len(certs),
            "skipped": skipped,
            "suspicious": 0,
        }
        return ok

    publish_alert(DOMAIN, suspicious)
    alert: CtAlert = {
        "status": "alert",
        "checked": len(certs),
        "skipped": skipped,
        "suspicious": len(suspicious),
        "unexpected": suspicious,
    }
    return alert


def _safe_id(value: object) -> str:
    try:
        return str(int(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _clean(value)


def _utf8_len(text: str) -> int:
    return len(text.encode("utf-8"))


def _cert_block(cert: CrtshEntry) -> list[str]:
    cert_id = _safe_id(cert.get("id"))
    names = _clean((cert.get("name_value") or "").replace("\n", ", "))
    return [
        f"- crt.sh ID: {cert_id}",
        f"  Issuer:    {_clean(cert.get('issuer_name'))}",
        f"  CN:        {_clean(cert.get('common_name'))}",
        f"  Names:     {names}",
        f"  Entry:     {_clean(cert.get('entry_timestamp'))}",
        f"  Link:      https://crt.sh/?id={cert_id}",
        "",
    ]


def format_alert(domain: str, certs: list[CrtshEntry]) -> str:
    """Render the alert body, bounded by both _MAX_ALERT_CERTS and
    _MAX_ALERT_BYTES so an attacker cannot push the message past the SNS
    Publish limit and suppress the alert entirely."""
    lines = [
        f"CT log monitoring detected {len(certs)} certificate(s) for {domain}",
        f"issued by an issuer outside the allow-list ({', '.join(ALLOWED_ISSUER_SUBSTRINGS)}).",
        "",
        "If you did not request these, treat as possible mis-issuance:",
        "  1. Identify each cert via the crt.sh links below.",
        "  2. Contact the issuing CA to request revocation.",
        "  3. Audit CAA records and AWS account access.",
        "",
    ]
    used = _utf8_len("\n".join(lines))
    rendered = 0
    for cert in certs[:_MAX_ALERT_CERTS]:
        block = _cert_block(cert)
        size = _utf8_len("\n".join(block)) + 1
        if used + size > _MAX_ALERT_BYTES:
            break
        lines.extend(block)
        used += size
        rendered += 1

    omitted = len(certs) - rendered
    if omitted > 0:
        lines.append(
            f"({omitted} further certificate(s) omitted from this message. "
            "The full list is in the ct-monitor Lambda's CloudWatch logs, and at "
            f"https://crt.sh/?q={urllib.parse.quote(domain)})",
        )
    return "\n".join(lines)


def _summary_alert(domain: str, count: int) -> str:
    """Minimal fallback body, built only from a count and the configured
    domain -- no untrusted crt.sh field reaches it, so its size is fixed."""
    return "\n".join([
        f"CT log monitoring detected {count} certificate(s) for {domain}",
        "issued by an issuer outside the allow-list.",
        "",
        "The detailed alert could not be published. Treat this as possible",
        "mis-issuance and inspect the ct-monitor Lambda's CloudWatch logs,",
        f"then review https://crt.sh/?q={urllib.parse.quote(domain)}",
    ])


def publish_alert(domain: str, certs: list[CrtshEntry]) -> None:
    """Publish the alert, degrading to a count-only summary if the full
    body cannot be published.

    This monitor is the post-issuance safety net for CAA, so losing the
    alert's detail is strictly better than losing the alert. If the
    summary fails too, the exception propagates: the invocation errors
    and the Errors alarm in `ct_monitor.tf` fires.
    """
    subject = f"[ct-monitor] Unexpected cert issuance for {domain}"
    try:
        sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=format_alert(domain, certs),
        )
        return
    except Exception:
        logger.exception("ct-monitor: detailed alert publish failed, falling back to summary")

    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=_summary_alert(domain, len(certs)),
    )
