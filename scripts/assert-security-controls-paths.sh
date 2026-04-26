#!/usr/bin/env bash
#
# Assert every `code:` path declared in src/data/security-controls.ts
# resolves to a real file in the repo. The /security/ page's whole
# credibility is "every claim cites the implementation" — a stale path
# (file renamed, deleted, or never existed in this branch) silently
# breaks that promise. The script turns the runtime invariant into a
# CI failure.
#
# What it checks:
#   - The data file itself exists (refuses to assert blind).
#   - Every quoted string inside a `code: [ ... ]` array refers to a
#     file that exists relative to the repo root.
#
# What it does NOT check:
#   - PR numbers in `prs:` (a closed PR is still a valid historical link).
#   - External `verify:` URLs (network-dependent — out of scope for CI).
#   - Whether the cited file actually implements what the entry claims
#     (no static analysis can verify that; that's review).
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

DATA_FILE="src/data/security-controls.ts"

if [ ! -s "$DATA_FILE" ]; then
	lint::refuse_blind "$DATA_FILE missing or empty"
fi

# Extract every `code: [ ... ]` array's contents and pull out each
# quoted path. `code` lines are typically multi-line:
#   code: ['foo.tf', 'bar.tf'],
# or single-line. Awk anchors `code:` to the start of an indented line
# (the data file's convention) — without that anchor, prose that happens
# to contain the substring `code: [` (a future tradeoffs blurb, a JSDoc
# example, a string literal mentioning the field name) would falsely
# open a block and pull unrelated quoted strings into the lint as bogus
# paths. The leading sub() also strips `// ...` line comments so a
# commented-out path inside a `code: [ ... ]` array doesn't get checked
# as if it were live.
#
# bash 3.2 (macOS) chokes on `#` comments inside `< <(...)` process
# substitution, so the explanation lives out here, not inline.
CITED_PATHS=()
while IFS= read -r p; do
	CITED_PATHS+=("$p")
done < <(
	awk '
		{ sub(/[[:space:]]*\/\/.*$/, ""); }
		/^[[:space:]]+code:[[:space:]]*\[/ { in_block = 1 }
		in_block { buf = buf " " $0 }
		in_block && /\]/ {
			print buf
			buf = ""
			in_block = 0
		}
	' "$DATA_FILE" \
		| grep -oE "['\"][^'\"]+['\"]" \
		| sed -E "s/^['\"](.*)['\"]$/\\1/" \
		| sort -u
)

if [ "${#CITED_PATHS[@]}" -eq 0 ]; then
	# Either no shipped controls cite code (unlikely) or the regex stopped
	# matching after a refactor. Either way, fail loudly rather than rubber-
	# stamp the lint.
	lint::refuse_blind "no code paths extracted from $DATA_FILE"
fi

printf 'security-controls.ts cites %d distinct code path(s)\n' "${#CITED_PATHS[@]}"

missing=0
for p in "${CITED_PATHS[@]}"; do
	if [ ! -e "$p" ]; then
		lint::fail "missing: $p"
		missing=1
	fi
done

if [ "$missing" -ne 0 ]; then
	printf '\nFix: update %s so every `code:` entry points at a real file in the repo.\n' "$DATA_FILE" >&2
	printf '     Either restore the missing file, or remove/rename the entry to match reality.\n' >&2
	exit 1
fi

lint::ok "all security-controls.ts code paths resolve"
