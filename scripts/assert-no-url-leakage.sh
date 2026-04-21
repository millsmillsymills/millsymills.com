#!/usr/bin/env bash
#
# Build with rehearsal env and confirm no production URL leaks into dist/.
# Any hit on the literal "https://millsymills.com" outside the allow-list
# below is a leak.
#
# Bare "millsymills.com" (brand text in OG SVGs, emails, project names) is
# allowed — this script only matches URL-form hardcodes.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BUILD_DIR=dist
STAGE_SITE_URL="https://p41m0n.com"

export SITE_URL="$STAGE_SITE_URL"
export NO_INDEX=true

printf '\n\033[1;36m== assert-no-url-leakage: rehearsal build ==\033[0m\n'
# Skip rebuild if dist/ already looks like a rehearsal build (CI typically
# runs the script right after `npm run build` with rehearsal SITE_URL —
# no point throwing away the artifact about to be deployed). Local
# invocations without a pre-built dist/ rebuild fresh.
if [ -f "$BUILD_DIR/index.html" ] && grep -q "$STAGE_SITE_URL" "$BUILD_DIR/index.html"; then
	printf 'dist/ already matches rehearsal SITE_URL; reusing existing build\n'
else
	rm -rf "$BUILD_DIR"
	npm run build
fi

printf '\n\033[1;36m== grep dist/ for https://millsymills.com ==\033[0m\n'

# -r: recursive. -n: line numbers. -I: skip binary files.
# Allow-list paths go after `--exclude` if we ever need them; none today.
if grep -rInI 'https://millsymills\.com' "$BUILD_DIR"; then
	printf '\n\033[1;31m✗ URL leakage detected: dist/ contains hardcoded https://millsymills.com.\033[0m\n'
	printf '   Fix: derive all emitted URLs from Astro.site, not string literals.\n'
	exit 1
fi

printf '\n\033[1;32m✓ no URL leakage\033[0m\n'
