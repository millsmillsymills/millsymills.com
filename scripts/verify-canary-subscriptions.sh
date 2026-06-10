#!/usr/bin/env bash
#
# Read-only audit of the canarytoken SNS topics (#141, #722). Both topics
# use email subscriptions, which AWS holds in PendingConfirmation until a
# human clicks the confirmation link. An unconfirmed subscription silently
# drops every alarm -- a tripwire that fires but pages nobody, the exact
# failure the canary exists to prevent. Terraform cannot confirm email
# subscriptions, so this closes the gap with an out-of-band assertion.
#
# Topics (see infra/canary.tf):
#   <slug>-canary         primary region   (key-used alarm)
#   <slug>-canary-robots  us-east-1        (robots-decoy tripwire alarm)
#
# Usage:
#   ./scripts/verify-canary-subscriptions.sh [domain] [primary-region]
#   # Defaults to millsymills.com in us-west-2 (the live stack).
#
# Wired into ci-local.sh as opt-in (set MMS_VERIFY_CANARY_SUBS=true to
# run; off by default because CI runners don't carry AWS creds). When
# enable_canary has not been applied the topics don't exist yet; the
# script reports that and exits clean rather than failing.

set -euo pipefail

DOMAIN="${1:-millsymills.com}"
PRIMARY_REGION="${2:-us-west-2}"
SLUG="${DOMAIN//./-}"

red() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }
section() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

if ! command -v aws >/dev/null 2>&1; then
	red "aws CLI not on PATH"
	exit 2
fi

ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null || echo "")
if [[ -z "$ACCOUNT" ]]; then
	red "no AWS credentials available -- run aws-login or aws configure first"
	exit 2
fi

FAILS=()
FOUND=0

# Assert that no email subscription on a topic is stuck PendingConfirmation.
# A missing topic means enable_canary hasn't been applied -- note and skip,
# don't fail (the canary is opt-in per stack).
check_topic() {
	local arn="$1" region="$2"
	local subs
	if ! subs=$(aws sns list-subscriptions-by-topic --topic-arn "$arn" --region "$region" \
		--query 'Subscriptions[].SubscriptionArn' --output text 2>/dev/null); then
		dim "  - $arn not found in $region (enable_canary not applied?) -- skipped"
		return 0
	fi
	FOUND=1
	if [[ -z "$subs" ]]; then
		FAILS+=("$arn has no subscriptions (expected one email subscription)")
		red "  ✗ $arn: no subscriptions"
		return 0
	fi
	local pending=0 sub
	for sub in $subs; do
		if [[ "$sub" == "PendingConfirmation" ]]; then
			pending=$((pending + 1))
		fi
	done
	if ((pending > 0)); then
		FAILS+=("$arn has $pending unconfirmed (PendingConfirmation) subscription(s)")
		red "  ✗ $arn: $pending subscription(s) PendingConfirmation"
	else
		green "  ✓ $arn: all subscriptions confirmed"
	fi
}

section "canary SNS subscriptions for $DOMAIN"
check_topic "arn:aws:sns:${PRIMARY_REGION}:${ACCOUNT}:${SLUG}-canary" "$PRIMARY_REGION"
check_topic "arn:aws:sns:us-east-1:${ACCOUNT}:${SLUG}-canary-robots" "us-east-1"

section "report"
if ((FOUND == 0)); then
	dim "no canary topics found -- enable_canary not applied for $DOMAIN, nothing to verify"
	exit 0
fi
if ((${#FAILS[@]} == 0)); then
	green "✓ all canary SNS subscriptions confirmed"
	exit 0
fi
red "✗ ${#FAILS[@]} issue(s) detected:"
for f in "${FAILS[@]}"; do
	red "  - $f"
done
red ""
red "Confirm the email subscription from the AWS SNS confirmation message,"
red "then re-run. See docs/runbooks/canarytokens.md."
exit 1
