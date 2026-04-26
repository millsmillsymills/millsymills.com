#!/usr/bin/env bash
#
# Assert every `/fonts/<file>` URL referenced in src/ ships as a real
# asset, and that the CSP `font-src 'self'` claim isn't quietly being
# undermined by a stray Google Fonts reference in the build output.
#
# Why this matters:
#   - If a referenced WOFF2 is missing (sparse checkout, accidental
#     .gitignore, lfs mis-fetch), the browser silently falls back to
#     `'Courier New', monospace`. No error, no CSP violation, no
#     telemetry — just "the site looks different."
#   - The privacy page claims "two self-hosted fonts ... zero third-
#     party fetches." A stray `fonts.googleapis.com` or `fonts.gstatic.com`
#     reference would silently 404 against `font-src 'self'`, but it
#     would also make the privacy page wrong. Catch the second case
#     here so the first doesn't matter.
#
# Source set is auto-derived from src/ — adding a new @font-face URL
# doesn't require updating this script. Removing the last reference to
# a font also fails (refuse to ship blind).
#
# Run after `npm run build` so dist/ exists. Wired into ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

PUBLIC_FONTS=public/fonts
DIST=dist

# Extract every `/fonts/<file>` URL referenced in src/. Catches
# `url('/fonts/x.woff2')`, `url("/fonts/x.ttf")`, and bare
# `url(/fonts/x.woff2)` — CSS, Astro, and JS all parsed the same way.
# Uses `while read` instead of `mapfile` for bash 3.2 (macOS) compat.
REFERENCED=()
while IFS= read -r line; do
	REFERENCED+=("$line")
done < <(
	grep -rhoE "url\\(['\"]?/fonts/[A-Za-z0-9_.-]+['\"]?\\)" src/ \
		| sed -E "s|url\\(['\"]?/fonts/([A-Za-z0-9_.-]+)['\"]?\\)|\\1|" \
		| sort -u
)

if [ "${#REFERENCED[@]}" -eq 0 ]; then
	lint::refuse_blind "no /fonts/ references found in src/"
fi

printf 'fonts referenced in src/: %d\n' "${#REFERENCED[@]}"
for f in "${REFERENCED[@]}"; do printf '  /fonts/%s\n' "$f"; done

# 1. Source files exist + are non-empty.
miss=0
for f in "${REFERENCED[@]}"; do
	if [ ! -s "$PUBLIC_FONTS/$f" ]; then
		lint::fail "missing source font: $PUBLIC_FONTS/$f"
		miss=1
	fi
done
[ "$miss" -eq 0 ] || exit 1

# 2. Build output mirrors source (only if dist/ exists — keep this
#    script runnable standalone without forcing a rebuild).
if [ -d "$DIST" ]; then
	for f in "${REFERENCED[@]}"; do
		if [ ! -s "$DIST/fonts/$f" ]; then
			lint::fail "missing built font: $DIST/fonts/$f"
			miss=1
		fi
	done
	[ "$miss" -eq 0 ] || exit 1

	# 3. CSP `font-src 'self'` is the policy; this is the assertion
	#    that the build agrees with it. Match only the URL form
	#    (`https://fonts.{googleapis,gstatic}.com`); a real font-load
	#    has to use a URL, while bare-hostname mentions inside `<code>`
	#    blocks (e.g. the /security page's roadmap describing what this
	#    very lint catches) are documentation, not fetches. Earlier
	#    versions of the regex matched `fonts\.(googleapis|gstatic)\.com`
	#    unconditionally and false-positived on /security/index.html.
	if grep -rInIE 'https?://fonts\.(googleapis|gstatic)\.com' "$DIST" >&2; then
		lint::fail "CSP drift: $DIST/ contains Google Fonts URLs"
		printf '  Fix: self-host the offending font under public/fonts/ and update the @font-face src.\n' >&2
		exit 1
	fi
else
	printf '(dist/ not present — skipping post-build checks; run `npm run build` first)\n'
fi

lint::ok "all referenced fonts ship; no Google Fonts leakage"
