#!/usr/bin/env bash
#
# Post-cutover verification for a site deployed via this repo's infra.
# Usage:
#   ./scripts/verify-p41m0n.sh                  # defaults to p41m0n.com
#   ./scripts/verify-p41m0n.sh <domain>         # override domain
#
# Exits 0 if every check passes. Exits non-zero on the first failure,
# with a descriptive error.

set -euo pipefail

DOMAIN="${1:-p41m0n.com}"
APEX="https://${DOMAIN}"
WWW="https://www.${DOMAIN}"

# Bound every curl with explicit timeouts. The script runs immediately
# post-cutover, exactly when CloudFront propagation is shakiest — without
# these, a slow origin hangs the verifier indefinitely with no go/no-go
# signal. Connect timeout is the TCP/TLS handshake budget; max time is
# the whole-request budget (so a stalled in-flight body still surfaces).
CURL_FLAGS=(--connect-timeout 10 --max-time 30)

fail() {
	printf '\n\033[1;31m✗ FAIL: %s\033[0m\n' "$1" >&2
	exit 1
}

ok() {
	printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

section() {
	printf '\n\033[1;36m== %s ==\033[0m\n' "$1"
}

check_cmd() {
	local desc="$1"; shift
	if "$@" >/dev/null 2>&1; then
		ok "$desc"
	else
		fail "$desc (command: $*)"
	fi
}

section "NS delegation (multi-resolver)"
for resolver in 8.8.8.8 1.1.1.1 9.9.9.9; do
	ns_output="$(dig @"$resolver" +short NS "$DOMAIN" | sort | tr '\n' ',' || true)"
	if [[ -z "$ns_output" ]]; then
		fail "dig @${resolver} NS ${DOMAIN} returned nothing"
	fi
	if echo "$ns_output" | grep -qi 'gandi'; then
		fail "resolver ${resolver} still sees Gandi NS: ${ns_output}"
	fi
	if ! echo "$ns_output" | grep -qi 'awsdns'; then
		fail "resolver ${resolver} does not see Route53 (awsdns) NS: ${ns_output}"
	fi
	ok "@${resolver}: Route53 NS"
done

section "A + AAAA"
check_cmd "dig A ${DOMAIN}" bash -c "dig +short A ${DOMAIN} | grep -qE '^[0-9.]+\$'"
check_cmd "dig AAAA ${DOMAIN}" bash -c "dig +short AAAA ${DOMAIN} | grep -qE '^[0-9a-f:]+\$'"

section "HTTPS + security headers"
# Anchor each cross-origin value to end-of-value (whitespace or line end)
# so a less-restrictive setting like `same-origin-allow-popups` for COOP
# wouldn't substring-match `same-origin` and silently pass the check.
# Existing HSTS/CSP grep patterns are header-presence-only (they cover
# very flexible value shapes), so anchoring there would be over-broad.
headers="$(curl -sI "${CURL_FLAGS[@]}" "$APEX/")"
echo "$headers" | grep -qi '^HTTP/.* 200' || fail "GET ${APEX}/ did not return 200"
echo "$headers" | grep -qi '^strict-transport-security:' || fail "HSTS header missing"
echo "$headers" | grep -qi '^content-security-policy:' || fail "CSP header missing"
echo "$headers" | grep -qi '^x-content-type-options:[[:space:]]*nosniff[[:space:]]*$' || fail "X-Content-Type-Options not exactly 'nosniff'"
echo "$headers" | grep -qi '^referrer-policy:' || fail "Referrer-Policy missing"
echo "$headers" | grep -qiE '^cross-origin-opener-policy:[[:space:]]+same-origin[[:space:]]*$' || fail "COOP not exactly 'same-origin'"
echo "$headers" | grep -qiE '^cross-origin-embedder-policy:[[:space:]]+require-corp[[:space:]]*$' || fail "COEP not exactly 'require-corp'"
echo "$headers" | grep -qiE '^cross-origin-resource-policy:[[:space:]]+same-origin[[:space:]]*$' || fail "CORP not exactly 'same-origin'"
ok "apex HTTPS + security headers (incl. cross-origin isolation triple)"

section "TLS 1.3-only floor"
# minimum_protocol_version = TLSv1.3_2025 in CloudFront — pre-2018 browsers
# (Chrome <70 / Firefox <63 / Safari <14) and old curl/openssl will fail
# the floor check. Documented as a tradeoff in the tls-pqc /security/ entry.
#
# Use openssl s_client (not curl --tls-max) for the version-cap negative
# test. macOS system curl is built against SecureTransport, which silently
# accepts and ignores --tls-max — meaning a curl-based 1.2-rejected check
# negotiates 1.3 anyway and reads as "TLS 1.2 succeeded → fail" against a
# correctly-configured stack. openssl honours -tls1_2 cross-platform.
if ! command -v openssl >/dev/null 2>&1; then
	fail "openssl not on PATH — required for TLS 1.3 floor check"
fi
tls12_handshake="$(openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" -tls1_2 </dev/null 2>&1 || true)"
if echo "$tls12_handshake" | grep -qE 'CONNECTED.*Cipher.*: *(?!0+\b)[A-Z0-9_-]+' >/dev/null 2>&1 \
	|| echo "$tls12_handshake" | grep -qE '^[[:space:]]*Protocol[[:space:]]*:[[:space:]]*TLSv1\.2'; then
	fail "TLS 1.2 handshake completed — CloudFront should reject anything below TLS 1.3"
fi
if ! echo "$tls12_handshake" | grep -qiE 'alert|handshake failure|tlsv1 alert|sslv3 alert|protocol version'; then
	fail "TLS 1.2 negative test inconclusive — openssl output didn't show a TLS-version alert. Check network connectivity before trusting this result."
fi
ok "TLS 1.2 rejected (server alert)"

if ! curl --tlsv1.3 -sI -o /dev/null "${CURL_FLAGS[@]}" "$APEX/"; then
	fail "TLS 1.3 connection failed — CloudFront viewer policy may not be TLSv1.3_2025"
fi
ok "TLS 1.3 negotiated"

# openssl >= maj.min: true when implementation is OpenSSL (NOT LibreSSL —
# LibreSSL 3.5+ would pass numeric comparison but lacks ML-KEM-768) and
# either v[1] > maj or v[1] == maj AND v[2] >= min. command -v guard
# above means we know openssl exists; awk reads its version line.
openssl_version_ge() {
	local maj="$1" min="$2"
	openssl version 2>/dev/null | awk -v maj="$maj" -v min="$min" '
		$1 == "OpenSSL" {
			split($2, v, ".")
			exit (v[1] > maj || (v[1] == maj && v[2] >= min)) ? 0 : 1
		}
		# Any non-OpenSSL line (LibreSSL, missing) → no rule fires → END runs → exit 1
		END { exit 1 }
	'
}

# AWS auto-enables hybrid post-quantum KEX on every TLS 1.3 connection
# under TLSv1.3_2025. Only clients that already speak ML-KEM-768 negotiate
# it (openssl 3.5+ in 2025-2026, still rolling out). Once OpenSSL is
# capable, non-negotiation is a real regression — promote to fail rather
# than warning. If the local openssl is too old or LibreSSL, skip with a
# soft warning so the script remains runnable on macOS LibreSSL hosts.
if openssl_version_ge 3 5; then
	pqc_temp_key="$(openssl s_client -connect "${DOMAIN}:443" -groups X25519MLKEM768 </dev/null 2>/dev/null | grep 'Server Temp Key' || true)"
	if echo "$pqc_temp_key" | grep -q 'X25519MLKEM768'; then
		ok "PQC hybrid KEX negotiating (${pqc_temp_key#*: })"
	else
		fail "PQC hybrid KEX not negotiated. OpenSSL ≥ 3.5 is offering X25519MLKEM768 but server returned: ${pqc_temp_key:-<empty>}"
	fi
else
	printf '\033[1;33m! local openssl is LibreSSL or < 3.5 — skipping PQC verification. Run from a host with OpenSSL ≥ 3.5 to confirm X25519MLKEM768 negotiation.\033[0m\n' >&2
fi

www_status="$(curl -s "${CURL_FLAGS[@]}" -o /dev/null -w '%{http_code}' "$WWW/")"
[[ "$www_status" == "200" ]] || fail "GET ${WWW}/ returned ${www_status}, expected 200"
ok "www HTTPS"

section "CloudFront Function directory-index rewrite"
# /about/ is a placeholder; any multi-page route on the site works. Update
# here if the site's page structure differs.
for path in / /sitemap.xml /robots.txt; do
	code="$(curl -s "${CURL_FLAGS[@]}" -o /dev/null -w '%{http_code}' "${APEX}${path}")"
	[[ "$code" == "200" ]] || fail "GET ${APEX}${path} returned ${code}, expected 200"
done
ok "core paths 200"

section "noindex + rehearsal robots.txt"
# If DOMAIN is the rehearsal domain, we expect disallow-all. If prod, allow.
robots_body="$(curl -s "${CURL_FLAGS[@]}" "${APEX}/robots.txt")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$robots_body" | grep -qE '^User-agent: *\*' || fail "robots.txt missing User-agent: *"
	echo "$robots_body" | grep -qE '^Disallow: */' || fail "rehearsal robots.txt should Disallow: /"
	ok "rehearsal robots.txt disallow-all"
else
	echo "$robots_body" | grep -qE '^Allow: */' || fail "prod robots.txt missing Allow: /"
	ok "prod robots.txt permissive"
fi

index_html="$(curl -s "${CURL_FLAGS[@]}" "${APEX}/")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$index_html" | grep -q 'name="robots" content="noindex,nofollow"' || fail "rehearsal HTML missing noindex meta"
	ok "rehearsal HTML has noindex meta"
fi

section "no millsymills URL leakage"
if [[ "$DOMAIN" != "millsymills.com" ]]; then
	leaked=""
	for path in / /sitemap.xml /robots.txt; do
		if curl -s "${CURL_FLAGS[@]}" "${APEX}${path}" | grep -q 'https://millsymills\.com'; then
			leaked="${leaked}${path} "
		fi
	done
	if [[ -n "$leaked" ]]; then
		fail "production URL leakage on: ${leaked}"
	fi
	ok "no millsymills URL leakage in served content"
fi

section "email (null-MX + strict DMARC)"
mx="$(dig +short MX "$DOMAIN")"
[[ "$mx" == "0 ." ]] || fail "expected null MX (\"0 .\"), got: ${mx}"
ok "null MX published"

spf="$(dig +short TXT "$DOMAIN" | grep 'v=spf1' || true)"
echo "$spf" | grep -q -- '-all' || fail "SPF is not sender-free (-all): ${spf}"
ok "SPF -all"

dmarc="$(dig +short TXT "_dmarc.${DOMAIN}" | tr -d '"' | tr ';' '\n' || true)"
echo "$dmarc" | grep -qE 'p=reject' || fail "DMARC is not p=reject"
ok "DMARC p=reject"

printf '\n\033[1;32mALL CHECKS PASSED for %s\033[0m\n' "$DOMAIN"
