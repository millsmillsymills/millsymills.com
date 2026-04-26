#!/usr/bin/env bash
#
# Assert dist/llms.txt enumerates every app from src/data/apps.ts and
# every well-known path the generator promises. Catches generator-side
# regressions where a stray `.filter()` or a misnamed iteration silently
# shrinks the agent-readable surface — same drift class the static-file
# version of llms.txt suffered from before #217 converted it to a
# generator.
#
# What it checks:
#   1. Every `id` in src/data/apps.ts appears as a `/<id>/` URL in dist/llms.txt.
#   2. The five canonical /.well-known/* + /-files paths the generator
#      hardcodes are all present in dist/llms.txt.
#   3. The PGP fingerprint string from src/data/pgp.ts appears in dist/llms.txt.
#
# What it does NOT check:
#   - dist/llms-full.txt completeness (still hand-maintained per #217's
#     deferred follow-up).
#   - Whether the bullet copy matches ogDescription verbatim — the generator
#     could legitimately escape characters or reformat without breaking the
#     "every app surfaced" invariant this lint defends.
#
# Wired into scripts/ci-local.sh next to the other post-build asserts.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

DIST_FILE="dist/llms.txt"
APPS_FILE="src/data/apps.ts"
PGP_FILE="src/data/pgp.ts"

if [ ! -s "$DIST_FILE" ]; then
	printf '  Hint: run `npm run build` first.\n' >&2
	lint::refuse_blind "$DIST_FILE missing or empty"
fi

# Extract every literal `id: '<value>'` declaration from apps.ts. The
# data file uses single-quoted string-literal id fields (verified shape;
# no template literals or computed keys). Sort + uniq for diagnostics.
APP_IDS=()
while IFS= read -r id; do
	APP_IDS+=("$id")
done < <(
	grep -oE "id:[[:space:]]*'[a-z][a-z0-9-]*'" "$APPS_FILE" \
		| sed -E "s/id:[[:space:]]*'([a-z0-9-]+)'/\\1/" \
		| sort -u
)

if [ "${#APP_IDS[@]}" -eq 0 ]; then
	lint::refuse_blind "no app ids extracted from $APPS_FILE"
fi

printf 'apps.ts declares %d distinct ids\n' "${#APP_IDS[@]}"

missing=0
for id in "${APP_IDS[@]}"; do
	# Match "/${id}/" inside a markdown link target. Avoid false positives
	# from the well-known section by anchoring on the trailing slash that
	# only app routes carry.
	if ! grep -qE "\(https?://[^)]+/${id}/\)" "$DIST_FILE"; then
		lint::fail "apps.ts id '$id' not found in $DIST_FILE"
		missing=1
	fi
done

# Hardcoded list mirrors the generator. If the generator's machine-readable
# block grows or shrinks, update this list in lockstep.
WELL_KNOWN=(
	"/files/resume.md"
	"/llms-full.txt"
	"/sitemap.xml"
	"/.well-known/security.txt"
	"/.well-known/sbom.spdx.json"
)
for path in "${WELL_KNOWN[@]}"; do
	if ! grep -qF "$path" "$DIST_FILE"; then
		lint::fail "well-known path $path not found in $DIST_FILE"
		missing=1
	fi
done

# PGP fingerprint check: extract the fingerprint string from pgp.ts and
# confirm it survived into dist/. Catches the case where the import
# fails silently (unlikely with TS, but the lint runs after build so a
# build-time exception would have failed earlier — this is belt-and-
# suspenders).
PGP_FINGERPRINT=$(grep -oE "fingerprint: '[A-F0-9 ]+'" "$PGP_FILE" \
	| sed -E "s/fingerprint: '([A-F0-9 ]+)'/\\1/")
if [ -z "$PGP_FINGERPRINT" ]; then
	lint::refuse_blind "no PGP fingerprint extracted from $PGP_FILE"
fi
if ! grep -qF "$PGP_FINGERPRINT" "$DIST_FILE"; then
	lint::fail "PGP fingerprint $PGP_FINGERPRINT not found in $DIST_FILE"
	missing=1
fi

if [ "$missing" -ne 0 ]; then
	printf '\nFix: src/pages/llms.txt.ts must surface every app from apps.ts,\n' >&2
	printf '     every documented well-known path, and the PGP fingerprint.\n' >&2
	lint::fatal "dist/llms.txt is missing required entries"
fi

lint::ok "dist/llms.txt covers all ${#APP_IDS[@]} apps + ${#WELL_KNOWN[@]} well-known paths + PGP fingerprint"
