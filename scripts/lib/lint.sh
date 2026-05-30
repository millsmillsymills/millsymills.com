#!/usr/bin/env bash
#
# Shared helpers for the assert-*.sh CI lint scripts. Sourced rather
# than executed:
#
#   . "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
#   lint::cd_to_repo_root
#   ...
#
# Five-script duplication crossed the rule-of-three threshold once
# assert-llms-txt-completeness.sh landed (#218); code review on that PR
# named the extraction directly. The narrow surface here is deliberate
# — only the four genuinely-shared concerns are abstracted; per-script
# extraction logic (grep / sed / awk pipelines, well-known constants,
# refuse-blind messaging that's specific to the source data shape) stays
# inline because that's where each lint genuinely differs.
#
# Bash 3.2 (macOS default) compatible. No bash 4+ features.

# lint::cd_to_repo_root
#   Move to the git toplevel. All assert-*.sh scripts then reference
#   relative paths from the repo root. Fails loudly if invoked outside
#   a git checkout (acceptable: every entry point is via ci-local.sh
#   or direct invocation in a working tree).
lint::cd_to_repo_root() {
	local root
	root="$(git rev-parse --show-toplevel)" || exit 1
	cd "$root" || exit 1
}

# lint::ok "<message>"
#   Green ✓ to stdout. Use for the final success line of a lint
#   (and only the final line — intermediate progress should be plain
#   printf so an aggregating wrapper like ci-local.sh's `ok "..."` is
#   the visible success indicator).
lint::ok() {
	printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

# lint::fail "<message>"
#   Red ✗ to stderr. Does NOT exit, so callers can accumulate (e.g.
#   set `missing=1` and continue scanning, then `exit 1` at the end
#   to surface every drift in a single run).
lint::fail() {
	printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2
}

# lint::fatal "<message>"
#   Red ✗ to stderr + exit 1. Use for terminal-after-loop checks
#   ("if any failures accumulated above, stop here") so the per-script
#   `lint::fail "..."; exit 1` boilerplate stays uniform across the
#   four sibling lints. lint::fail is for the accumulating case;
#   lint::fatal is for the final-stop case.
lint::fatal() {
	lint::fail "$1"
	exit 1
}

# lint::refuse_blind "<short-reason>"
#   Print a red "refusing to assert blind" failure to stderr and exit
#   1. Use when the lint's own extraction step came back empty — that
#   means the underlying data shape changed (regex stopped matching,
#   data file moved, etc.) and a subsequent pass-or-fail result would
#   be meaningless. The refuse-blind class is what stops a regex
#   regression from silently turning a real lint into a green no-op.
#
#   Contract: pass a SHORT FRAGMENT (e.g. `"$DATA_FILE missing or empty"`).
#   The helper appends ` — refusing to assert blind`. Don't pre-include
#   that suffix in the caller's message, or actionable hints — those
#   should follow on a separate stderr line via printf if needed.
lint::refuse_blind() {
	printf '\033[1;31m✗ %s — refusing to assert blind\033[0m\n' "$1" >&2
	exit 1
}
