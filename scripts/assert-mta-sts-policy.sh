#!/usr/bin/env bash
#
# Assert the built MTA-STS policy (dist/.well-known/mta-sts.txt) is present
# and well-formed per RFC 8461, and that its mode matches the source route.
#
# Why: millsymills.com serves the policy in `mode: enforce` (#734). Under
# enforce, conforming senders refuse delivery to any MX not covered by a
# retrievable, well-formed policy. A build regression that drops or mangles
# the file would be a silent deliverability outage with no other CI signal —
# unlike the SBOM and SLSA artifacts, the policy file had no presence guard.
#
# What it checks (against dist/, post-build):
#   1. The file exists and is non-empty.
#   2. `version: STSv1` is present (RFC 8461 §3.2 — first directive).
#   3. The built `mode:` matches the source route literal, so a stale or
#      mismatched build is caught rather than passing on a hardcoded value.
#   4. At least one `mx:` line is present.
#   5. `max_age:` is present and >= 604800 (the RFC 8461 §3.2 SHOULD floor).
#
# Wired into scripts/ci-local.sh after the build, next to the other
# post-build asserts. Bash 3.2 (macOS default) compatible.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

DIST_FILE="dist/.well-known/mta-sts.txt"
SRC_FILE="src/pages/.well-known/mta-sts.txt.ts"

if [ ! -s "$DIST_FILE" ]; then
	printf '  Hint: run `npm run build` first.\n' >&2
	lint::refuse_blind "$DIST_FILE missing or empty"
fi

# Source-of-truth mode from the Astro route body literal, e.g. 'mode: enforce'.
SRC_MODE=$(grep -oE "'mode: (testing|enforce|none)'" "$SRC_FILE" | head -1 | sed -E "s/'mode: (.+)'/\1/")
if [ -z "$SRC_MODE" ]; then
	lint::refuse_blind "no mode: line extracted from $SRC_FILE"
fi

missing=0

if ! grep -qE '^version: STSv1$' "$DIST_FILE"; then
	lint::fail "$DIST_FILE missing 'version: STSv1'"
	missing=1
fi

if ! grep -qE "^mode: ${SRC_MODE}$" "$DIST_FILE"; then
	lint::fail "$DIST_FILE mode does not match source route (expected '$SRC_MODE')"
	missing=1
fi

if ! grep -qE '^mx: [^[:space:]]+' "$DIST_FILE"; then
	lint::fail "$DIST_FILE has no mx: line"
	missing=1
fi

max_age=$(grep -oE '^max_age: [0-9]+' "$DIST_FILE" | head -1 | sed -E 's/max_age: //')
if [ -z "$max_age" ]; then
	lint::fail "$DIST_FILE has no max_age: line"
	missing=1
elif [ "$max_age" -lt 604800 ]; then
	lint::fail "$DIST_FILE max_age $max_age below the RFC 8461 floor of 604800"
	missing=1
fi

if [ "$missing" -ne 0 ]; then
	lint::fatal "dist/.well-known/mta-sts.txt missing or malformed"
fi

lint::ok "mta-sts.txt present + well-formed (mode: $SRC_MODE, max_age >= 604800)"
