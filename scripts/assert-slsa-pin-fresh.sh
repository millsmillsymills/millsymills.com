#!/usr/bin/env bash
#
# Check that deploy.yml uses a reviewed SLSA generator tag compatible with
# the hosted runner's Node 24 runtime. An action declaring node20 can run
# on Node 24: GitHub forces the newer runtime after Node 20 removal.
# A calendar deadline alone therefore does not establish incompatibility.
#
# v2.1.0 evidence: production run 36844042155 on 2026-10-01 completed
# provenance / detect-env, generator, and final successfully. The generator
# log explicitly confirms its node20 actions were forced onto Node 24:
# https://github.com/millsmillsymills/millsymills.com/actions/runs/36844042155/job/110310314741
# Upstream migration remains tracked in #661 and upstream issue #4490.
# Revalidate compatibility before adding another tag to the allowlist.
# The deploy job still requires successful provenance generation.
#
# Wired into scripts/ci-local.sh and CI.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

readonly UPSTREAM_ISSUE="https://github.com/slsa-framework/slsa-github-generator/issues/4490"
readonly LOCAL_ISSUE="#661"
readonly USES_PATTERN='slsa-framework/slsa-github-generator/\.github/workflows/generator_generic_slsa3\.yml@v[0-9]+\.[0-9]+\.[0-9]+'

# Versions verified on Node 24; unknown tags fail until reviewed.
readonly -a NODE24_COMPATIBLE_VERSIONS=(
	"v2.1.0"
)

extract_pin() {
	local file="$1"
	local matches
	matches=$(grep -hoE "${USES_PATTERN}" "${file}" | sort -u || true)
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

for version in "${NODE24_COMPATIBLE_VERSIONS[@]}"; do
	if [[ "${current_version}" == "${version}" ]]; then
		echo "OK: SLSA generator pin ${current_version} verified compatible with Node 24"
		echo "WARN: upstream still declares Node-20 actions; keep tracking ${LOCAL_ISSUE} (${UPSTREAM_ISSUE})"
		exit 0
	fi
done

echo "FAIL: SLSA generator pin ${current_version} has not been reviewed for Node-24 compatibility" >&2
echo "      Verify the pinned generator on Node 24 before adding it to NODE24_COMPATIBLE_VERSIONS." >&2
echo "      Upstream tracking: ${UPSTREAM_ISSUE}" >&2
echo "      Local tracking:    ${LOCAL_ISSUE}" >&2
exit 1
