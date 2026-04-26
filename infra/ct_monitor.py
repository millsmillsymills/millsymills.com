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
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

DOMAIN = os.environ["DOMAIN"]
SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
ALLOWED_ISSUER_SUBSTRINGS = [
    s.strip() for s in os.environ["ALLOWED_ISSUER_SUBSTRINGS"].split(",") if s.strip()
]
LOOKBACK_HOURS = int(os.environ.get("LOOKBACK_HOURS", "48"))

CRTSH_URL = "https://crt.sh/?q={query}&output=json"

sns = boto3.client("sns")


def fetch_certs(domain):
    url = CRTSH_URL.format(query=urllib.parse.quote(domain))
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"{domain}-ct-monitor"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def is_allowed(issuer):
    return any(s.lower() in issuer.lower() for s in ALLOWED_ISSUER_SUBSTRINGS)


def lambda_handler(event, context):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)

    certs = fetch_certs(DOMAIN)
    suspicious = []
    for cert in certs:
        # crt.sh entry_timestamp is naive UTC ISO-8601, e.g. "2026-04-01T12:34:56.789".
        entry_ts = datetime.fromisoformat(cert["entry_timestamp"]).replace(tzinfo=timezone.utc)
        if entry_ts < cutoff:
            continue
        if not is_allowed(cert.get("issuer_name", "")):
            suspicious.append(cert)

    if not suspicious:
        return {"status": "ok", "checked": len(certs)}

    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[ct-monitor] Unexpected cert issuance for {DOMAIN}",
        Message=format_alert(DOMAIN, suspicious),
    )
    return {"status": "alert", "suspicious": len(suspicious)}


def format_alert(domain, certs):
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
    for c in certs:
        names = (c.get("name_value") or "").replace("\n", ", ")
        lines.extend([
            f"- crt.sh ID: {c.get('id')}",
            f"  Issuer:    {c.get('issuer_name')}",
            f"  CN:        {c.get('common_name')}",
            f"  Names:     {names}",
            f"  Entry:     {c.get('entry_timestamp')}",
            f"  Link:      https://crt.sh/?id={c.get('id')}",
            "",
        ])
    return "\n".join(lines)
