#!/usr/bin/env bash
#
# Assert every `iconUrl` value in src/data/apps.ts maps to a real file
# under public/. Catches typos and forgotten asset drops that Astro's
# static build does NOT detect — it treats iconUrl as an opaque string,
# so a bad path ships as a silent 404 on a desktop icon.
#
# Runs in milliseconds; cheap to wire into ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

APPS_FILE="src/data/apps.ts"
PUBLIC_DIR="public"

printf '\n\033[1;36m== assert-icon-assets-exist ==\033[0m\n'

# The pattern in apps.ts is always single-quoted, leading slash, e.g.
#   iconUrl: '/images/icons/vaporwave/floppy-disk.png',
# If we ever switch to double quotes or template literals the extraction
# regex below will need to widen.
missing=0
total=0
while IFS= read -r url; do
	total=$((total + 1))
	path="$PUBLIC_DIR${url}"
	if [ ! -f "$path" ]; then
		lint::fail "missing asset: $path (referenced as $url in $APPS_FILE)"
		missing=$((missing + 1))
	fi
done < <(grep -oE "iconUrl: '[^']+'" "$APPS_FILE" | sed -E "s/.*'([^']+)'.*/\1/")

if [ "$total" -eq 0 ]; then
	lint::refuse_blind "no iconUrl values extracted from $APPS_FILE"
fi

if [ "$missing" -gt 0 ]; then
	lint::fatal "$missing iconUrl value(s) do not resolve to a file in $PUBLIC_DIR/."
fi

lint::ok "all $total iconUrl values resolve to files under $PUBLIC_DIR/"
