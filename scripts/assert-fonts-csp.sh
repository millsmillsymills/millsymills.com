#!/usr/bin/env bash
#
# Assert every `/fonts/<file>` URL referenced in src/ + public/ ships as
# a real asset, and that the CSP `font-src 'self'` claim isn't quietly
# being undermined by a cross-origin font reference in the build output.
#
# Why this matters:
#   - If a referenced WOFF2 is missing (sparse checkout, accidental
#     .gitignore, lfs mis-fetch), the browser silently falls back to
#     `'Courier New', monospace`. No error, no CSP violation, no
#     telemetry — just "the site looks different."
#   - The privacy page claims the site self-hosts its fonts with zero
#     third-party fetches. Any cross-origin font reference — a Google
#     Fonts `<link>`, or an `@font-face src: url(https://cdn/...)` to
#     any other host — would silently 404 against `font-src 'self'` and
#     would also make the privacy page wrong. Catch it here so the
#     first failure mode never matters.
#
# The cross-origin scan runs over dist/, which mirrors public/ verbatim
# (static assets like the unifi-demo's own HTML/CSS ship from there), so
# a re-introduced third-party font under public/ is caught the same as
# one emitted from src/. The scan is host-agnostic: it flags Google
# Fonts hosts AND any absolute/protocol-relative URL pointing at a font
# file, so a non-Google CDN doesn't slip through.
#
# Source set is auto-derived from src/ + public/ — adding a new
# @font-face URL doesn't require updating this script. Removing the last
# reference to a font also fails (refuse to ship blind).
#
# Run after `npm run build` so dist/ exists. Wired into ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

PUBLIC_FONTS=public/fonts
DIST=dist

# Extract every `/fonts/<file>` URL referenced in src/ + public/. Catches
# `url('/fonts/x.woff2')`, `url("/fonts/x.ttf")`, and bare
# `url(/fonts/x.woff2)` — CSS, Astro, HTML, and JS all parsed the same way.
# Uses `while read` instead of `mapfile` for bash 3.2 (macOS) compat.
REFERENCED=()
while IFS= read -r line; do
	REFERENCED+=("$line")
done < <(
	grep -rhoE "url\\(['\"]?/fonts/[A-Za-z0-9_.-]+['\"]?\\)" src/ public/ \
		| sed -E "s|url\\(['\"]?/fonts/([A-Za-z0-9_.-]+)['\"]?\\)|\\1|" \
		| sort -u
)

if [ "${#REFERENCED[@]}" -eq 0 ]; then
	lint::refuse_blind "no /fonts/ references found in src/ or public/"
fi

printf 'fonts referenced in src/ + public/: %d\n' "${#REFERENCED[@]}"
for f in "${REFERENCED[@]}"; do printf '  /fonts/%s\n' "$f"; done

# 1. Source files exist + are non-empty + carry the right magic bytes
#    for their extension. A 0-byte file is caught by `-s`; an HTML
#    error page (e.g. a 4xx body that snuck past curl during an ad-hoc
#    `curl -L`) is caught by the magic-byte sniff. Belt-and-suspenders
#    against the failure mode where someone re-fetches a font and
#    silently commits an `<html>...` error response under the woff2
#    extension.
miss=0
for f in "${REFERENCED[@]}"; do
	path="$PUBLIC_FONTS/$f"
	if [ ! -s "$path" ]; then
		lint::fail "missing source font: $path"
		miss=1
		continue
	fi
	# `xxd -p -l 4` prints the first 4 bytes as 8 lowercase hex chars.
	magic_hex=$(xxd -p -l 4 "$path")
	case "$f" in
		*.woff2)
			# WOFF2 magic = ASCII 'wOF2' = 0x77 0x4F 0x46 0x32 (RFC 8081 §3)
			if [ "$magic_hex" != "774f4632" ]; then
				lint::fail "$path is not a WOFF2 file (magic: $magic_hex; expected 774f4632 / 'wOF2')"
				miss=1
			fi
			;;
		*.woff)
			# WOFF magic = ASCII 'wOFF' = 0x77 0x4F 0x46 0x46 (RFC 8081)
			if [ "$magic_hex" != "774f4646" ]; then
				lint::fail "$path is not a WOFF file (magic: $magic_hex; expected 774f4646 / 'wOFF')"
				miss=1
			fi
			;;
		*.ttf)
			# TrueType signature = 0x00 0x01 0x00 0x00 (Apple TTF spec)
			if [ "$magic_hex" != "00010000" ]; then
				lint::fail "$path is not a TTF file (magic: $magic_hex; expected 00010000)"
				miss=1
			fi
			;;
	esac
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
	#    that the build agrees with it. Match URL forms only — real
	#    font-loading needs an actual URL, while bare-hostname mentions
	#    inside `<code>` blocks (e.g. the /security page's roadmap
	#    describing what this lint catches) are documentation, not
	#    fetches. The optional `(https?:)?//` allows protocol-relative
	#    forms (`//fonts.googleapis.com/...`) too — Astro doesn't
	#    synthesize those today and CSP would block them anyway, but
	#    catching them at lint-time is free belt-and-suspenders.
	if grep -rInIE '(https?:)?//fonts\.(googleapis|gstatic)\.com' "$DIST" >&2; then
		printf '  Fix: self-host the offending font under public/fonts/ and update the @font-face src.\n' >&2
		lint::fatal "CSP drift: $DIST/ contains Google Fonts URLs"
	fi

	# 3b. Any OTHER cross-origin font file. Google Fonts loads via a CSS
	#     `<link>` whose URL carries no font extension (caught above);
	#     a direct `@font-face src: url(https://cdn/x.woff2)` to any host
	#     does. `font-src 'self'` permits only same-origin fonts, so an
	#     absolute or protocol-relative URL ending in a font extension is
	#     a third-party fetch the CSP would block. A self-hosted ref is
	#     root-relative (`/fonts/x.woff2`) — single leading slash, no
	#     host — so it can't match the `//host/` form required here.
	if grep -rInIE "(https?:)?//[A-Za-z0-9_.-]+/[^\"')[:space:]]*\.(woff2?|ttf|otf|eot)\b" "$DIST" >&2; then
		printf '  Fix: self-host the offending font under public/fonts/ and reference it as /fonts/<file>.\n' >&2
		lint::fatal "CSP drift: $DIST/ references a cross-origin font file"
	fi
else
	printf '(dist/ not present — skipping post-build checks; run `npm run build` first)\n'
fi

lint::ok "all referenced fonts ship; no cross-origin font leakage"
