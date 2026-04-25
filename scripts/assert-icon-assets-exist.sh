#!/usr/bin/env bash
#
# Assert every `iconUrl` value in src/data/apps.ts maps to a real file
# under public/. Catches typos and forgotten asset drops that Astro's
# static build does NOT detect — it treats iconUrl as an opaque string,
# so a bad path ships as a silent 404 on a desktop icon.
#
# Runs in milliseconds; cheap to wire into ci-local.sh.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

APPS_FILE="src/data/apps.ts"
PUBLIC_DIR="public"

printf '\n\033[1;36m== assert-icon-assets-exist ==\033[0m\n'

# The pattern in apps.ts is always single-quoted, leading slash, e.g.
#   iconUrl: '/images/icons/vaporwave/crest.png',
# If we ever switch to double quotes or template literals the extraction
# regex below will need to widen.
missing=0
total=0
while IFS= read -r url; do
	total=$((total + 1))
	path="$PUBLIC_DIR${url}"
	if [ ! -f "$path" ]; then
		printf '\033[1;31m✗ missing asset: %s (referenced as %s in %s)\033[0m\n' "$path" "$url" "$APPS_FILE"
		missing=$((missing + 1))
	fi
done < <(grep -oE "iconUrl: '[^']+'" "$APPS_FILE" | sed -E "s/.*'([^']+)'.*/\1/")

if [ "$missing" -gt 0 ]; then
	printf '\n\033[1;31m%d iconUrl value(s) do not resolve to a file in %s/.\033[0m\n' "$missing" "$PUBLIC_DIR"
	exit 1
fi

printf '\033[1;32m✓ all %d iconUrl values resolve to files under %s/\033[0m\n' "$total" "$PUBLIC_DIR"
