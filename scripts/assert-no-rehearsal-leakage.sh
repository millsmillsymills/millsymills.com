#!/usr/bin/env bash
#
# Build with prod env and confirm no rehearsal URL leaks into dist/.
# Symmetric to assert-no-url-leakage.sh — that script catches a prod URL
# leaking into a rehearsal build; this one catches a rehearsal URL leaking
# into a prod build.
#
# Less likely to regress in practice (you'd have to hand-hardcode a p41m0n
# URL somewhere), but symmetric belt-and-suspenders is cheap.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BUILD_DIR=dist
PROD_SITE_URL="https://millsymills.com"

export SITE_URL="$PROD_SITE_URL"
unset NO_INDEX

printf '\n\033[1;36m== assert-no-rehearsal-leakage: prod build ==\033[0m\n'
# Skip rebuild if dist/ already looks like a prod build (CI typically runs
# the script right after `npm run build` with prod SITE_URL — no point
# throwing away the artifact about to be deployed). Local invocations
# without a pre-built dist/ rebuild fresh.
if [ -f "$BUILD_DIR/index.html" ] && grep -q "$PROD_SITE_URL" "$BUILD_DIR/index.html"; then
	printf 'dist/ already matches prod SITE_URL; reusing existing build\n'
else
	rm -rf "$BUILD_DIR"
	npm run build
fi

printf '\n\033[1;36m== grep dist/ for https://p41m0n.com ==\033[0m\n'

# -r: recursive. -n: line numbers. -I: skip binary files.
if grep -rInI 'https://p41m0n\.com' "$BUILD_DIR"; then
	printf '\n\033[1;31m✗ rehearsal URL leakage detected: dist/ contains hardcoded https://p41m0n.com.\033[0m\n'
	printf '   Fix: derive all emitted URLs from Astro.site, not string literals.\n'
	exit 1
fi

printf '\n\033[1;32m✓ no rehearsal URL leakage\033[0m\n'
