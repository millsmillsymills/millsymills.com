#!/usr/bin/env bash
#
# Assert every `path:` citation declared in src/data/privacy-copy.ts
# resolves to a real file in the repo. The /privacy/ page's credibility
# is the same as /security/'s: "every claim cites the implementation".
# A stale path (file renamed, deleted, or never existed in this branch)
# silently breaks that promise — exactly the drift #765 caught, where a
# citation pointed at src/pages/robots.txt.ts while the real file is
# public/robots.txt. This turns the runtime invariant into a CI failure.
#
# What it checks:
#   - The data file itself exists (refuses to assert blind).
#   - Every `path: '...'` value points at a file that exists relative
#     to the repo root.
#
# What it does NOT check:
#   - The `label:` text (human prose, not a path).
#   - Whether the cited file actually implements what the entry claims
#     (no static analysis can verify that; that's review).
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

DATA_FILE="src/data/privacy-copy.ts"

if [ ! -s "$DATA_FILE" ]; then
	lint::refuse_blind "$DATA_FILE missing or empty"
fi

# Citations are always inline single-quoted: `path: 'src/foo.ts'`. If the
# field is ever reshaped (double quotes, template literals, multi-line),
# this extraction stops matching and the refuse_blind guard below fires
# rather than rubber-stamping a green no-op.
CITED_PATHS=()
while IFS= read -r p; do
	CITED_PATHS+=("$p")
done < <(grep -oE "path: '[^']+'" "$DATA_FILE" | sed -E "s/path: '([^']+)'/\\1/" | sort -u)

if [ "${#CITED_PATHS[@]}" -eq 0 ]; then
	lint::refuse_blind "no path citations extracted from $DATA_FILE"
fi

printf 'privacy-copy.ts cites %d distinct path(s)\n' "${#CITED_PATHS[@]}"

missing=0
for p in "${CITED_PATHS[@]}"; do
	if [ ! -e "$p" ]; then
		lint::fail "missing: $p"
		missing=1
	fi
done

if [ "$missing" -ne 0 ]; then
	printf '\nFix: update %s so every `path:` citation points at a real file in the repo.\n' "$DATA_FILE" >&2
	printf '     Either restore the missing file, or correct the path to match reality.\n' >&2
	lint::fatal "privacy-copy.ts cites paths that do not exist"
fi

lint::ok "all privacy-copy.ts citation paths resolve"
