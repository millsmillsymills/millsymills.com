#!/usr/bin/env bash
# Static checks only: never execute assertion or live verification scripts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for tool in shellcheck shfmt; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		printf '%s not on PATH; install with brew install %s\n' "$tool" "$tool" >&2
		exit 1
	fi
done
scripts=(scripts/lint-shell.sh scripts/analytics/run.sh scripts/analytics/lint-queries.sh scripts/smoke-*.sh scripts/assert-*.sh scripts/verify-*.sh)
# Follow the annotated shared lint helper; lint sourced code as well.
shellcheck -x "${scripts[@]}"
# Indent case patterns to match the repository's existing shell style.
shfmt -ci -d "${scripts[@]}"
