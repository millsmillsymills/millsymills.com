#!/usr/bin/env bash
#
# Assert every scripts/assert-* invocation in scripts/ci-local.sh also
# appears as a step in .github/workflows/ci.yml. ci.yml's header claims
# lockstep with ci-local.sh (#332) but nothing enforced it — one assert
# script ran only locally for ~5 weeks while PR CI stayed green (#839).
#
# Wired into BOTH ci-local.sh and ci.yml, so it guards itself: removing
# it (or any other assert) from ci.yml fails the local run, and vice
# versa a new local-only assert fails CI's copy of this check.
#
# Legitimately local-only asserts (anything gated behind an MMS_* env
# opt-in in ci-local.sh) belong in ALLOWLIST below with a one-line
# comment per exemption.
set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL=scripts/ci-local.sh
WORKFLOW=.github/workflows/ci.yml

# One entry per exemption, with a comment explaining why it can't run in CI.
ALLOWLIST=()

# Invocation lines only ("./scripts/assert-x.sh", "node scripts/assert-x.mjs"),
# not comments or strings — anchored to line start after optional indent.
invoked=$(grep -Eo '^[[:space:]]*(\./|node )scripts/assert-[a-z0-9-]+\.(sh|mjs)' "$LOCAL" |
	grep -Eo 'scripts/assert-[a-z0-9-]+\.(sh|mjs)' | sort -u)

if [[ -z "$invoked" ]]; then
	echo "✗ extracted zero assert invocations from $LOCAL — extraction regex drifted from the script's shape" >&2
	exit 1
fi

missing=()
while IFS= read -r script; do
	for exempt in ${ALLOWLIST[@]+"${ALLOWLIST[@]}"}; do
		[[ "$script" == "$exempt" ]] && continue 2
	done
	grep -qF "$script" "$WORKFLOW" || missing+=("$script")
done <<<"$invoked"

if ((${#missing[@]} > 0)); then
	for m in "${missing[@]}"; do
		echo "✗ $m runs in $LOCAL but has no step in $WORKFLOW" >&2
	done
	echo "✗ add the missing step(s) to $WORKFLOW (or, if genuinely local-only, add to ALLOWLIST here with a justification)" >&2
	exit 1
fi

count=$(wc -l <<<"$invoked" | tr -d ' ')
echo "✓ all $count assert scripts in $LOCAL are mirrored in $WORKFLOW"
