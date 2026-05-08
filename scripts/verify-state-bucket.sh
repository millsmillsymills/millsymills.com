#!/usr/bin/env bash
#
# Read-only audit of the Terraform state bucket against the controls
# codified in `infra/bootstrap-state/main.tf`. Closes the verification
# half of #283. Does NOT mutate anything -- the bucket policy +
# versioning + SSE config are read with `aws s3api get-*` calls and
# checked locally.
#
# Usage:
#   ./scripts/verify-state-bucket.sh [bucket] [region]
#   # Defaults to millsymills-terraform-state in us-west-2 (the values
#   # in infra/stacks/*.backend.hcl).
#
# Wired into ci-local.sh as opt-in (set MMS_VERIFY_STATE_BUCKET=true
# to run; off by default because CI runners don't carry AWS creds).
# Locally, run after `aws-login` or any other STS-token export.

set -euo pipefail

BUCKET="${1:-millsymills-terraform-state}"
REGION="${2:-us-west-2}"

red() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
section() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

if ! command -v aws >/dev/null 2>&1; then
	red "aws CLI not on PATH"
	exit 2
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
	red "no AWS credentials available -- run aws-login or aws configure first"
	exit 2
fi

# Each check appends to FAILS so the script reports every drift, not
# just the first.
FAILS=()

fail() {
	red "  ✗ $*"
	FAILS+=("$*")
}

ok() {
	green "  ✓ $*"
}

section "bucket exists"
if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
	red "bucket $BUCKET not reachable in $REGION"
	exit 3
fi
ok "$BUCKET reachable in $REGION"

section "versioning enabled"
v=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --region "$REGION" --query 'Status' --output text 2>&1 || echo "ERROR")
if [[ "$v" == "Enabled" ]]; then
	ok "versioning: Enabled"
else
	fail "versioning: $v (expected Enabled)"
fi

section "default encryption configured"
sse=$(aws s3api get-bucket-encryption --bucket "$BUCKET" --region "$REGION" \
	--query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
	--output text 2>&1 || echo "ERROR")
if [[ "$sse" == "AES256" || "$sse" == "aws:kms" ]]; then
	ok "default SSE: $sse"
else
	fail "default SSE: $sse (expected AES256 or aws:kms)"
fi

section "public access block"
pab_json=$(aws s3api get-public-access-block --bucket "$BUCKET" --region "$REGION" \
	--query 'PublicAccessBlockConfiguration' --output json 2>&1 || echo '{}')
for k in BlockPublicAcls IgnorePublicAcls BlockPublicPolicy RestrictPublicBuckets; do
	v=$(printf '%s' "$pab_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$k'))" 2>/dev/null || echo "False")
	if [[ "$v" == "True" ]]; then
		ok "$k: True"
	else
		fail "$k: $v (expected True)"
	fi
done

section "ownership controls (BucketOwnerEnforced)"
own=$(aws s3api get-bucket-ownership-controls --bucket "$BUCKET" --region "$REGION" \
	--query 'OwnershipControls.Rules[0].ObjectOwnership' --output text 2>&1 || echo "ERROR")
if [[ "$own" == "BucketOwnerEnforced" ]]; then
	ok "ownership: BucketOwnerEnforced"
else
	fail "ownership: $own (expected BucketOwnerEnforced)"
fi

section "TLS-only bucket policy"
policy=$(aws s3api get-bucket-policy --bucket "$BUCKET" --region "$REGION" \
	--query 'Policy' --output text 2>&1 || echo "ERROR")
if [[ "$policy" == "ERROR" || "$policy" == *"NoSuchBucketPolicy"* ]]; then
	fail "no bucket policy attached (expected DenyInsecureTransport)"
else
	# Look for the canonical Deny on aws:SecureTransport=false. Use
	# python to parse JSON so we don't false-positive on a Statement
	# that mentions SecureTransport but allows insecure access.
	if printf '%s' "$policy" | python3 -c "
import json, sys
p = json.loads(sys.stdin.read())
for s in p.get('Statement', []):
    if s.get('Effect') == 'Deny':
        cond = s.get('Condition', {}).get('Bool', {})
        if cond.get('aws:SecureTransport') in ('false', 'False', False):
            sys.exit(0)
sys.exit(1)
"; then
		ok "DenyInsecureTransport statement present"
	else
		fail "policy attached but no Deny on aws:SecureTransport=false"
	fi
fi

section "lifecycle on noncurrent versions"
# JMESPath needs literal backticks; the single quotes are intentional --
# nothing here should expand in shell.
# shellcheck disable=SC2016
lifecycle=$(aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" --region "$REGION" \
	--query 'Rules[?Status==`Enabled`]' --output json 2>&1 || echo "[]")
if printf '%s' "$lifecycle" | python3 -c "
import json, sys
rs = json.loads(sys.stdin.read())
for r in rs:
    if r.get('NoncurrentVersionExpiration', {}).get('NoncurrentDays', 0) > 0:
        sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
	ok "noncurrent_version_expiration rule present"
else
	fail "no Enabled rule with NoncurrentVersionExpiration"
fi

section "report"
if (( ${#FAILS[@]} == 0 )); then
	green "✓ all state-bucket controls match infra/bootstrap-state/main.tf"
	exit 0
fi
red "✗ ${#FAILS[@]} drift(s) detected:"
for f in "${FAILS[@]}"; do
	red "  - $f"
done
red ""
red "Reconcile by running terraform apply in infra/bootstrap-state/."
red "See infra/bootstrap-state/README.md for the import + apply path."
exit 1
