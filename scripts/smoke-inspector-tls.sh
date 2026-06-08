#!/usr/bin/env bash
#
# Post-deploy smoke test: assert that the raw inspector_tls Lambda
# Function URL returns 403 to unsigned requests. Closes the
# defense-in-depth gap from issue #354 — the OAC + IAM-auth combo
# locked in by PR #343 is the load-bearing protection for the
# /api/tls/* endpoint, and a regression there (e.g. a future Terraform
# refactor that toggles `authorization_type = NONE`) would silently
# re-open the public Function URL. This script catches that drift.
#
# Usage:
#   ./scripts/smoke-inspector-tls.sh <stack>
#   # e.g. ./scripts/smoke-inspector-tls.sh millsymills
#
# Requires: aws CLI configured for the target account, curl.
# Resolves the Lambda function name from `var.domain` exactly the way
# `infra/inspector_tls.tf` does (replace `.` -> `-`).

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
# line cannot match. Fail loudly if absent — a silent fallback would
# mask a tfvars typo and probe the wrong stack.
DOMAIN=$(grep -E '^domain[[:space:]]*=[[:space:]]*"' "$TFVARS" |
	head -1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$DOMAIN" ]]; then
	printf 'error: no domain = "..." line in %s\n' "$TFVARS" >&2
	exit 2
fi
FUNCTION_NAME="${DOMAIN//./-}-inspector-tls"

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
	printf 'error: no Function URL for %s — is the stack deployed?\n' \
		"$FUNCTION_NAME" >&2
	exit 3
fi

printf 'probing raw Function URL: %s\n' "$LAMBDA_URL" >&2

# `|| true` so a hard curl failure (DNS, connection refused, timeout)
# doesn't trip pipefail before the actionable diagnostic below fires.
http=$(curl --silent --output /dev/null --write-out '%{http_code}' \
	--max-time 10 "$LAMBDA_URL" || true)
if [[ -z "$http" || "$http" == "000" ]]; then
	printf 'FAIL: curl failed to reach %s (no HTTP response).\n' \
		"$LAMBDA_URL" >&2
	exit 1
fi
# AWS_IAM auth on a Function URL returns 403 to unsigned requests.
# Anything else (200 / 401 / 5xx) means the OAC + IAM-auth boundary
# regressed.
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL returned %s (expected 403). ' "$http" >&2
	printf 'OAC + IAM-auth regressed; see infra/inspector_tls.tf.\n' >&2
	exit 1
fi

printf 'OK: raw Function URL returns 403 — OAC + IAM-auth boundary intact.\n' >&2
