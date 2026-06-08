#!/usr/bin/env bash
#
# Post-deploy smoke test: assert that the raw webauthn_demo Lambda
# Function URL returns 403 to direct callers lacking the CloudFront-injected
# x-origin-secret header. Mirrors `scripts/smoke-csp-report.sh`.
#
# Unlike inspector_tls / csp_report (which gate via authorization_type =
# "AWS_IAM"), the webauthn_demo Function URL is authorization_type = "NONE"
# (it must accept browser-originated POSTs proxied by CloudFront). Its only
# protection is the application-layer, constant-time `x-origin-secret` check
# in infra/lambdas/webauthn_demo/index.mjs. A regression there (the header
# check removed, the secret env var unset, or a Terraform refactor that
# stops CloudFront injecting the header) would silently expose the raw
# Function URL. `terraform validate` cannot see this; this script can.
#
# Usage:
#   ./scripts/smoke-webauthn-demo.sh <stack>
#   # e.g. ./scripts/smoke-webauthn-demo.sh millsymills
#
# Requires: aws CLI configured for the target account, curl.
# Resolves the Lambda function name from `var.domain` exactly the way
# `infra/webauthn_demo.tf` does (replace `.` -> `-`).

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

# Read `domain = "..."` out of the stack's tfvars. Fall back to the
# variables.tf default of millsymills.com only if absent.
DOMAIN=$(grep -E '^domain[[:space:]]*=' "$TFVARS" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
DOMAIN="${DOMAIN:-millsymills.com}"
FUNCTION_NAME="${DOMAIN//./-}-webauthn-demo"

# The Lambda lives in the stack's primary region (us-west-2), which may
# differ from the caller's configured default region. Pin it from tfvars so
# the lookup resolves regardless of ambient AWS_REGION.
REGION=$(grep -E '^aws_region[[:space:]]*=' "$TFVARS" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
REGION="${REGION:-us-west-2}"

LAMBDA_URL=$(aws lambda get-function-url-config \
	--function-name "$FUNCTION_NAME" \
	--region "$REGION" \
	--query FunctionUrl \
	--output text 2>/dev/null)

if [[ -z "$LAMBDA_URL" || "$LAMBDA_URL" == "None" ]]; then
	printf 'error: no Function URL for %s -- is the stack deployed with enable_webauthn_demo = true?\n' "$FUNCTION_NAME" >&2
	exit 3
fi

printf 'probing raw Function URL: %s\n' "$LAMBDA_URL" >&2

# A direct caller lacking x-origin-secret gets a uniform 403 regardless of
# method or path. Probe GET / and POST to a real route — both must 403.
http=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "$LAMBDA_URL")
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL GET returned %s (expected 403). The x-origin-secret gate regressed; see infra/webauthn_demo.tf.\n' "$http" >&2
	exit 1
fi

http=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
	-X POST -H 'content-type: application/json' --data '{"displayName":"smoke"}' \
	"${LAMBDA_URL%/}/api/passkey/registration/options")
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL POST returned %s (expected 403). The x-origin-secret gate regressed; see infra/webauthn_demo.tf.\n' "$http" >&2
	exit 1
fi

# A wrong secret must also 403 — proves the constant-time compare rejects a
# mismatched value, not merely a missing header.
http=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
	-X POST -H 'content-type: application/json' -H 'x-origin-secret: not-the-secret' \
	--data '{"displayName":"smoke"}' \
	"${LAMBDA_URL%/}/api/passkey/registration/options")
if [[ "$http" != "403" ]]; then
	printf 'FAIL: raw Function URL with a wrong x-origin-secret returned %s (expected 403). The secret comparison regressed; see infra/lambdas/webauthn_demo/index.mjs.\n' "$http" >&2
	exit 1
fi

printf 'OK: raw Function URL returns 403 with no/wrong x-origin-secret -- direct-call gate intact.\n' >&2
