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
headers="$(curl -sI "$APEX/")"
echo "$headers" | grep -qi '^HTTP/.* 200' || fail "GET ${APEX}/ did not return 200"
echo "$headers" | grep -qi '^strict-transport-security:' || fail "HSTS header missing"
echo "$headers" | grep -qi '^content-security-policy:' || fail "CSP header missing"
echo "$headers" | grep -qi '^x-content-type-options: *nosniff' || fail "X-Content-Type-Options missing"
echo "$headers" | grep -qi '^referrer-policy:' || fail "Referrer-Policy missing"
ok "apex HTTPS + security headers"

www_status="$(curl -s -o /dev/null -w '%{http_code}' "$WWW/")"
[[ "$www_status" == "200" ]] || fail "GET ${WWW}/ returned ${www_status}, expected 200"
ok "www HTTPS"

section "CloudFront Function directory-index rewrite"
# /about/ is a placeholder; any multi-page route on the site works. Update
# here if the site's page structure differs.
for path in / /sitemap.xml /robots.txt; do
	code="$(curl -s -o /dev/null -w '%{http_code}' "${APEX}${path}")"
	[[ "$code" == "200" ]] || fail "GET ${APEX}${path} returned ${code}, expected 200"
done
ok "core paths 200"

section "noindex + rehearsal robots.txt"
# If DOMAIN is the rehearsal domain, we expect disallow-all. If prod, allow.
robots_body="$(curl -s "${APEX}/robots.txt")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$robots_body" | grep -qE '^User-agent: *\*' || fail "robots.txt missing User-agent: *"
	echo "$robots_body" | grep -qE '^Disallow: */' || fail "rehearsal robots.txt should Disallow: /"
	ok "rehearsal robots.txt disallow-all"
else
	echo "$robots_body" | grep -qE '^Allow: */' || fail "prod robots.txt missing Allow: /"
	ok "prod robots.txt permissive"
fi

index_html="$(curl -s "${APEX}/")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$index_html" | grep -q 'name="robots" content="noindex,nofollow"' || fail "rehearsal HTML missing noindex meta"
	ok "rehearsal HTML has noindex meta"
fi

section "no millsymills URL leakage"
if [[ "$DOMAIN" != "millsymills.com" ]]; then
	leaked=""
	for path in / /sitemap.xml /robots.txt; do
		if curl -s "${APEX}${path}" | grep -q 'https://millsymills\.com'; then
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
