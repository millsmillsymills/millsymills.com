#!/usr/bin/env bash
#
# Assert the SLSA generator pin in deploy.yml + deploy-rehearsal.yml has
# moved off a Node 20 release before GitHub flips the runner default to
# Node 24 (2026-06-02). After that date, Node-20-based actions are not
# guaranteed to keep working; on 2026-09-16, Node 20 is removed from the
# runner image entirely.
#
# Why a guardrail and not a bump:
#   The fix is upstream — slsa-framework/slsa-github-generator's
#   reusable workflow embeds Node-20 pinned action refs we can't override
#   from a caller. Tracked at
#     https://github.com/slsa-framework/slsa-github-generator/issues/4490
#   Latest release v2.1.0 (2025-02) still uses node20; main branch is
#   the same. Setting FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true on our
#   workflow does not propagate into the upstream reusable workflow's
#   jobs (env scoping is per workflow), so this is genuinely
#   blocked-on-upstream until they tag a Node-24 release.
#
# What this script catches:
#   1. Pin drift between the two deploy workflows (rehearsal must mirror
#      production for the pipeline-bug-catch property to hold).
#   2. The deadline silently passing without our pin moving forward.
#      Dependabot watches the github-actions ecosystem weekly and will
#      open a bump PR within ~7-14 days of the upstream release; this
#      script is the backstop if Dependabot misses or the release never
#      happens.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

readonly DEADLINE="2026-06-02"
readonly UPSTREAM_ISSUE="https://github.com/slsa-framework/slsa-github-generator/issues/4490"
readonly LOCAL_ISSUE="#389"
readonly USES_PATTERN='slsa-framework/slsa-github-generator/\.github/workflows/generator_generic_slsa3\.yml@v[0-9]+\.[0-9]+\.[0-9]+'

# Versions confirmed to embed Node-20 internal action refs. v2.1.0 is the
# latest release as of 2026-05; older tags are also Node-20. Extend this
# list rather than removing entries — once upstream cuts a Node-24
# release we want this lint to recognize the new tag as fresh, not to
# forget that v2.1.0 was stale.
readonly -a NODE20_VERSIONS=(
	"v2.1.0"
	"v2.0.0"
	"v1.10.0"
	"v1.9.1"
)

extract_pin() {
	local file="$1"
	local matches
	matches=$(grep -hoE "${USES_PATTERN}" "${file}" | sort -u)
	local count
	# `grep -c .` always prints a count to stdout (including 0), but exits
	# 1 on zero matches. Default bash inherit_errexit is off so a failing
	# command substitution does NOT abort the parent shell, but pin that
	# to `|| true` so the zero-pin branch is provably reachable rather
	# than depending on a subtle shopt default.
	count=$(printf '%s\n' "${matches}" | grep -c . || true)
	if [[ "${count}" -gt 1 ]]; then
		echo "FAIL: expected exactly 1 SLSA generator pin in ${file}, found ${count}:" >&2
		printf '%s\n' "${matches}" | sed 's/^/  /' >&2
		exit 1
	fi
	echo "${matches}"
}

deploy_pin=$(extract_pin .github/workflows/deploy.yml)
rehearsal_pin=$(extract_pin .github/workflows/deploy-rehearsal.yml)

if [[ -z "${deploy_pin}" || -z "${rehearsal_pin}" ]]; then
	echo "FAIL: could not locate slsa-github-generator pin in one or both deploy workflows" >&2
	echo "  deploy.yml:           ${deploy_pin:-<missing>}" >&2
	echo "  deploy-rehearsal.yml: ${rehearsal_pin:-<missing>}" >&2
	exit 1
fi

if [[ "${deploy_pin}" != "${rehearsal_pin}" ]]; then
	echo "FAIL: SLSA generator pin drift between deploy workflows" >&2
	echo "  deploy.yml:           ${deploy_pin}" >&2
	echo "  deploy-rehearsal.yml: ${rehearsal_pin}" >&2
	echo "Rehearsal must mirror prod or the pipeline-bug-catch property breaks." >&2
	exit 1
fi

current_version="${deploy_pin##*@}"

is_node20=false
for v in "${NODE20_VERSIONS[@]}"; do
	if [[ "${current_version}" == "${v}" ]]; then
		is_node20=true
		break
	fi
done

today=$(date -u +%Y-%m-%d)

if ! ${is_node20}; then
	echo "OK: SLSA generator pin ${current_version} not on the Node-20 list — assumed Node-24 ready"
	exit 0
fi

# Strict less-than: the deadline date itself flips us into the FAIL
# branch. That matches GitHub's own framing — 2026-06-02 IS the day
# Node 24 becomes the runner default, so any Node-20 pin still in place
# on the deadline date is already a regression risk.
if [[ "${today}" < "${DEADLINE}" ]]; then
	# Pin both sides of the subtraction to UTC so the countdown can't drift
	# by ±1 day across timezones; macOS `date -j` defaults to local time.
	deadline_epoch=$(TZ=UTC date -j -f "%Y-%m-%d" "${DEADLINE}" +%s 2>/dev/null \
		|| date -u -d "${DEADLINE}" +%s)
	days_left=$(((deadline_epoch - $(date -u +%s)) / 86400))
	echo "WARN: SLSA generator pin ${current_version} embeds Node-20 actions (${days_left} days until ${DEADLINE})"
	echo "      Upstream tracking: ${UPSTREAM_ISSUE}"
	echo "      Local tracking:    ${LOCAL_ISSUE}"
	exit 0
fi

echo "FAIL: SLSA generator pin ${current_version} still on Node-20 past deadline ${DEADLINE}" >&2
echo "      Bump deploy.yml + deploy-rehearsal.yml to a release whose embedded" >&2
echo "      Node action refs run on Node 24, then add the new tag to" >&2
echo "      NODE20_VERSIONS in this script (do not remove the old entries)." >&2
echo "      Upstream tracking: ${UPSTREAM_ISSUE}" >&2
echo "      Local tracking:    ${LOCAL_ISSUE}" >&2
exit 1
