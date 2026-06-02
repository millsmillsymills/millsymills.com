#!/usr/bin/env bash
#
# Assert the pre-paint flag-unlock bootstrap (#588) and the CloudFront CSP
# agree on a single SHA-256 hash.
#
# DesktopLayout.astro inlines a tiny script that reads localStorage and sets
# `body[data-flags-unlocked]` before first paint, so returning flag-capturers
# don't see the gated UI flash absent then reappear. `script-src` in the
# CloudFront CSP is 'self', which forbids inline scripts — the SHA-256 of that
# script's exact bytes is pinned in the policy as the one allowed inline source.
#
# The hash is computed from two places that must never drift:
#   - the script body Astro renders into dist/*.html
#   - the `'sha256-…'` source literal in infra/cloudfront.tf
# If they disagree the inline script is CSP-blocked at runtime and the FOUC
# returns silently. This lint recomputes the hash from the built HTML and fails
# if cloudfront.tf doesn't carry it. Runs after `npm run build` in ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

HTML=dist/index.html
CF_TF=infra/cloudfront.tf

if [ ! -s "$HTML" ]; then
	lint::refuse_blind "$HTML missing or empty (run npm run build first)"
fi
if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Recompute the hash from the inline script Astro emitted. node is already a
# hard dep of this repo's build, so leaning on it keeps the extraction exact
# (byte-for-byte, no shell-quoting hazards) rather than fighting sed/awk over
# the script's quotes and braces.
hash=$(node -e '
const fs = require("fs");
const crypto = require("crypto");
const html = fs.readFileSync(process.argv[1], "utf8");
const m = html.match(/<script[^>]*>(try\{var s=localStorage[\s\S]*?)<\/script>/);
if (!m) { process.stderr.write("inline flag-unlock script not found in built HTML\n"); process.exit(3); }
process.stdout.write("sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64"));
' "$HTML") || lint::refuse_blind "could not extract the inline flag-unlock script from $HTML"

if [ -z "$hash" ]; then
	lint::refuse_blind "empty hash from $HTML"
fi

# Every `script-src` in cloudfront.tf must carry the hash. grep -c counts the
# CSP lines; both the site policy and the passkey-demo policy render the same
# layout, so both must pin it.
src_lines=$(grep -c "script-src 'self'" "$CF_TF" || true)
pinned=$(grep -c "script-src 'self' '$hash'" "$CF_TF" || true)

if [ "$src_lines" -eq 0 ]; then
	lint::refuse_blind "no script-src directive found in $CF_TF"
fi

if [ "$pinned" -ne "$src_lines" ]; then
	lint::fail "CSP script-src in $CF_TF does not pin the inline flag-unlock hash"
	printf '  expected: script-src '\''self'\'' '\''%s'\''\n' "$hash" >&2
	printf '  %d of %d script-src directive(s) carry it.\n' "$pinned" "$src_lines" >&2
	printf '\nFix: update every script-src in %s to include '\''%s'\''.\n' "$CF_TF" "$hash" >&2
	printf '     The bytes are DesktopLayout.astro'\''s flagsInitInline; editing that string rotates the hash.\n' >&2
	lint::fatal "flag-unlock inline-script CSP hash drift (#588)"
fi

lint::ok "inline flag-unlock script hash ($hash) pinned in all $src_lines script-src directive(s)"
