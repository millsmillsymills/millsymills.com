#!/usr/bin/env bash
#
# Submit a Route53-signed zone's DNSSEC DS record to Gandi as the
# registrar. Gandi's `POST /v5/domain/domains/<fqdn>/dnskeys` does
# NOT accept the standard DS quadruple — it expects the DNSKEY (Gandi
# computes the DS internally). The `terraform output -raw
# dnssec_ds_record` value matches Gandi's computed digest exactly,
# but is for parent-zone verification only, not direct submission.
#
# Usage:
#   GANDI_API_KEY=... ./scripts/gandi-submit-ds.sh <fqdn> <stack>
#
# Reversal — REMOVE DS at registrar FIRST and wait the parent TTL
# (24h for `.com`) BEFORE disabling Route53 signing in Terraform, or
# the zone goes BOGUS for validating resolvers:
#   curl -X DELETE \
#     --header @<(printf 'Authorization: Bearer %s\n' "$GANDI_API_KEY") \
#     https://api.gandi.net/v5/domain/domains/<fqdn>/dnskeys/<id>
# The <id> is from `GET .../dnskeys` (or saved from the create
# response). Process substitution keeps the bearer off curl's argv.

set -euo pipefail

FQDN="${1:-}"
STACK="${2:-}"
if [[ -z "$FQDN" || -z "$STACK" ]]; then
	printf 'usage: GANDI_API_KEY=... %s <fqdn> <stack>\n' "$0" >&2
	exit 2
fi

if [[ -z "${GANDI_API_KEY:-}" ]]; then
	printf 'error: GANDI_API_KEY env var is required (Personal Access Token from https://admin.gandi.net/).\n' >&2
	exit 2
fi

for cmd in dig jq curl; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		printf 'error: %s is required but not on PATH.\n' "$cmd" >&2
		exit 2
	fi
done

REPO_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)

ZONE_NS=$("$REPO_ROOT/scripts/tf.sh" "$STACK" output -json route53_nameservers 2>/dev/null | jq -r '.[0]' || true)
if [[ -z "$ZONE_NS" || "$ZONE_NS" == "null" ]]; then
	# shellcheck disable=SC2016 # backticks are literal in the diagnostic
	printf 'error: could not read route53_nameservers output from tf stack %q. Run `./scripts/tf.sh %s init` first?\n' "$STACK" "$STACK" >&2
	exit 3
fi

# DNSKEY rdata wraps base64 across whitespace at ~56-char boundaries.
# Field 1 is flags, 2 is protocol (always 3), 3 is algorithm, 4..NF
# is the public key split by whitespace. Concatenate all of 4..NF so
# this works for any algorithm (13/ECDSA-P256 fits in fields 4-5;
# 14/ECDSA-P384 spans 4-6; etc.).
read -r FLAGS ALGO PUBKEY <<<"$(
	dig +short DNSKEY "$FQDN" @"$ZONE_NS" \
		| awk '$1==257 {flags=$1; algo=$3; key=""; for(i=4;i<=NF;i++) key=key $i; print flags, algo, key; exit}'
)"
if [[ -z "${PUBKEY:-}" || "$FLAGS" != "257" ]]; then
	printf 'error: no KSK (DNSKEY flags=257) returned for %s @%s. Is Route53 signing the zone yet?\n' "$FQDN" "$ZONE_NS" >&2
	exit 4
fi

printf 'submitting DS via DNSKEY (flags=%s algorithm=%s key-len=%d) for %s\n' "$FLAGS" "$ALGO" "${#PUBKEY}" "$FQDN" >&2

# Authorization header passed via process substitution so the bearer
# token never appears on curl's argv (visible in `ps -ef` and shell
# history). Verify with `ps -o pid,args -C curl` while the request is
# in flight — only the @/dev/fd/N reference should appear.
curl -fsSL \
	-X POST \
	--header @<(printf 'Authorization: Bearer %s\n' "$GANDI_API_KEY") \
	-H 'Content-Type: application/json' \
	--data "$(jq -nc --argjson algo "$ALGO" --arg pk "$PUBKEY" '{type: "ksk", algorithm: $algo, public_key: $pk}')" \
	"https://api.gandi.net/v5/domain/domains/${FQDN}/dnskeys"
echo
