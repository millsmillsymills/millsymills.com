#!/usr/bin/env bash
#
# Post-deploy smoke test: assert that the raw csp_report Lambda
# Function URL returns 403 to unsigned requests. Mirrors
# `scripts/smoke-inspector-tls.sh`. The OAC + IAM-auth combo locked in
# by PR #355 is the load-bearing protection for /api/csp-report; a
# regression there (e.g. a future Terraform refactor that toggles
# `authorization_type = NONE`) would silently re-open the public
# Function URL. This script catches that drift.
#
# Usage:
#   ./scripts/smoke-csp-report.sh <stack>
#   # e.g. ./scripts/smoke-csp-report.sh millsymills
#
# Requires: aws CLI configured for the target account, curl.
# Resolves the Lambda function name from `var.domain` exactly the way
# `infra/csp_report.tf` does (replace `.` -> `-`).

set -euo pipefail

STACK="${1:-}"
if [[ -z "$STACK" ]]; then
	printf 'usage: %s <stack>\n' "$0" >&2
	exit 2
fi

REPO_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
TFVARS="$REPO_ROOT/infra/stacks/$STACK.tfvars"
if [[ ! -f "$TFVARS" ]]; then
	printf 'error: no such stack %q (looked for %s)\n' "$STACK" "$TFVARS" >&2
	exit 2
fi

for cmd in aws curl; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		printf 'error: %s is required but not on PATH.\n' "$cmd" >&2
		exit 2
	fi
done

# Read `domain = "..."` out of the stack's tfvars. Anchor the `=` and
# opening quote so a `domain_prefix = ...` or commented `# domain = ...`
# line cannot match. Fail loudly if absent — a silent fallback would mask
# a tfvars typo and probe the wrong stack.
DOMAIN=$(grep -E '^domain[[:space:]]*=[[:space:]]*"' "$TFVARS" |
	head -1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$DOMAIN" ]]; then
	printf 'error: no domain = "..." line in %s\n' "$TFVARS" >&2
	exit 2
fi
FUNCTION_NAME="${DOMAIN//./-}-csp-report"

# The Lambda lives in the stack's primary region (us-west-2), which may
# differ from the caller's configured default region. Pin it from tfvars so
# the lookup resolves regardless of ambient AWS_REGION; fall back to the
# variables.tf default only if the key is absent.
REGION=$(grep -E '^aws_region[[:space:]]*=[[:space:]]*"' "$TFVARS" |
	head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
REGION="${REGION:-us-west-2}"

# Don't redirect stderr — expired-token / wrong-profile errors must
# surface, otherwise the empty-output branch below falsely blames
# "is the stack deployed?".
LAMBDA_URL=$(aws lambda get-function-url-config \
	--function-name "$FUNCTION_NAME" \
	--region "$REGION" \
	--query FunctionUrl \
	--output text)

if [[ -z "$LAMBDA_URL" || "$LAMBDA_URL" == "None" ]]; then
	printf 'error: no Function URL for %s -- is the stack deployed?\n' "$FUNCTION_NAME" >&2
	exit 3
fi

printf 'probing raw Function URL: %s\n' "$LAMBDA_URL" >&2

# Run a curl probe and stash its HTTP code in the global `http`. `|| true`
# so a hard curl failure (DNS, connection refused, timeout) doesn't trip
# pipefail before the actionable diagnostic fires; a `000`/empty result is a
# network failure (exit 1), distinct from a non-403 boundary regression.
# Sets a global rather than echoing into `$(...)` so the exit actually halts
# the script rather than only the subshell.
http=""
probe() {
	local label=$1
	shift
	http=$(curl --silent --output /dev/null --write-out '%{http_code}' \
		--max-time 10 "$@" || true)
	if [[ -z "$http" || "$http" == "000" ]]; then
		printf 'FAIL: curl failed to reach the Function URL (%s, no HTTP response).\n' \
			"$label" >&2
		exit 1
	fi
}

# AWS_IAM auth on a Function URL returns 403 to unsigned requests.
# Anything else (200 / 401 / 5xx) means the OAC + IAM-auth boundary
# regressed. POST is the only meaningful method against this Lambda
# (browsers POST CSP violation reports), so probe POST too.
probe 'GET /' "$LAMBDA_URL"
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL GET returned %s (expected 403). The OAC + IAM-auth boundary regressed; see infra/csp_report.tf.\n' "$http" >&2
	exit 1
fi

probe 'POST /' \
	-X POST -H 'content-type: application/csp-report' --data '{}' "$LAMBDA_URL"
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL POST returned %s (expected 403). The OAC + IAM-auth boundary regressed; see infra/csp_report.tf.\n' "$http" >&2
	exit 1
fi

printf 'OK: raw Function URL returns 403 on GET and POST -- OAC + IAM-auth boundary intact.\n' >&2
