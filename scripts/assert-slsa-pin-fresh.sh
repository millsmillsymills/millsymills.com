#!/usr/bin/env bash
#
# Assert the SLSA generator pin in deploy.yml has moved off a Node 20
# release before GitHub removes Node 20 from the runner image entirely
# on 2026-09-16. The 2026-06-16 default-flip date (GitHub changelog,
# actions/runner#4462) only auto-bumps Node-20 actions to the Node-24
# runtime — it does not break them, and `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true`
# opts back into Node 20 until the fall-2026 hard removal. So the tripwire
# is set to the hard-removal date — the point at which a still-Node-20 pin
# genuinely stops working, with no opt-out left.
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
#   The deadline silently passing without our pin moving forward.
#   Dependabot watches the github-actions ecosystem weekly and will
#   open a bump PR within ~7-14 days of the upstream release; this
#   script is the backstop if Dependabot misses or the release never
#   happens.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

readonly DEADLINE="2026-09-16"
readonly UPSTREAM_ISSUE="https://github.com/slsa-framework/slsa-github-generator/issues/4490"
readonly LOCAL_ISSUE="#661"
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

if [[ -z "${deploy_pin}" ]]; then
	echo "FAIL: could not locate slsa-github-generator pin in deploy.yml" >&2
	exit 1
fi

current_version="${deploy_pin##*@}"

# Opt-in upstream check (network): when MMS_CHECK_SLSA_UPSTREAM=true, query
# the public releases API and surface whether upstream has cut a release
# newer than the pinned one — the human-action trigger this guardrail
# otherwise waits on (slsa-github-generator#4490). Off by default so the
# default lint stays offline and deterministic, matching the
# MMS_VERIFY_STATE_BUCKET opt-in in scripts/verify-state-bucket.sh.
if [[ "${MMS_CHECK_SLSA_UPSTREAM:-}" == "true" ]]; then
	if command -v gh >/dev/null 2>&1; then
		latest_tag=$(gh api repos/slsa-framework/slsa-github-generator/releases/latest \
			--jq '.tag_name' 2>/dev/null || true)
		if [[ -z "${latest_tag}" ]]; then
			echo "INFO: MMS_CHECK_SLSA_UPSTREAM set but upstream releases API unreachable — skipping"
		elif [[ "${latest_tag}" != "${current_version}" ]]; then
			echo "ACTION: upstream slsa-github-generator latest is ${latest_tag}, pinned ${current_version}."
			echo "        Evaluate it for Node-24 readiness and bump deploy.yml if ready (${UPSTREAM_ISSUE})."
		else
			echo "OK: upstream latest (${latest_tag}) matches the pinned version — nothing newer to evaluate"
		fi
	else
		echo "INFO: MMS_CHECK_SLSA_UPSTREAM set but gh not installed — skipping upstream check"
	fi
fi

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
# branch. 2026-09-16 IS the day Node 20 is removed from the runner
# image, so any Node-20 pin still in place on that date is already
# broken, not merely at risk.
if [[ "${today}" < "${DEADLINE}" ]]; then
	# Pin both sides of the subtraction to UTC so the countdown can't drift
	# by ±1 day across timezones; macOS `date -j` defaults to local time.
	deadline_epoch=$(TZ=UTC date -j -f "%Y-%m-%d" "${DEADLINE}" +%s 2>/dev/null ||
		date -u -d "${DEADLINE}" +%s)
	days_left=$(((deadline_epoch - $(date -u +%s)) / 86400))
	echo "WARN: SLSA generator pin ${current_version} embeds Node-20 actions (${days_left} days until ${DEADLINE})"
	echo "      Upstream tracking: ${UPSTREAM_ISSUE}"
	echo "      Local tracking:    ${LOCAL_ISSUE}"
	exit 0
fi

echo "FAIL: SLSA generator pin ${current_version} still on Node-20 past deadline ${DEADLINE}" >&2
echo "      Bump deploy.yml to a release whose embedded Node action refs" >&2
echo "      run on Node 24, then add the new tag to NODE20_VERSIONS in" >&2
echo "      this script (do not remove the old entries)." >&2
echo "      Upstream tracking: ${UPSTREAM_ISSUE}" >&2
echo "      Local tracking:    ${LOCAL_ISSUE}" >&2
exit 1
