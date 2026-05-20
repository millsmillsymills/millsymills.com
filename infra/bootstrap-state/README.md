# Bootstrap state bucket

Codifies the S3 bucket that holds Terraform state for every site
stack (`millsymills`, `p41m0n`). Closes #283: the bucket was
previously created by hand from the AWS console, with no
Terraform plan or audit trail behind its required controls
(versioning, SSE, public-access-block, TLS-only policy,
lifecycle).

## Why this is a separate root

The site stacks under `infra/` use an `s3` backend that points at
this bucket. Until the bucket exists, no stack can `terraform
init`. This module manages the bucket itself, so it cannot use
the same backend -- chicken-and-egg. It uses the local backend
by default; see "Optional: migrate state into the bucket" below
for the path to remote state.

## Controls codified

| Control                            | Resource                                              |
|------------------------------------|-------------------------------------------------------|
| Versioning enabled                 | `aws_s3_bucket_versioning.state`                     |
| SSE-S3 default encryption          | `aws_s3_bucket_server_side_encryption_configuration` |
| Block-all-public-access            | `aws_s3_bucket_public_access_block.state`            |
| BucketOwnerEnforced (no ACLs)      | `aws_s3_bucket_ownership_controls.state`             |
| TLS-only bucket policy             | `aws_s3_bucket_policy.state` (`aws:SecureTransport`) |
| Lifecycle on noncurrent versions   | `aws_s3_bucket_lifecycle_configuration.state`        |
| `prevent_destroy` on the bucket    | `lifecycle` block on `aws_s3_bucket.state`           |

The companion read-only audit script `scripts/verify-state-bucket.sh`
asserts the live bucket matches all of the above (opt-in via
`MMS_VERIFY_STATE_BUCKET=true ./scripts/ci-local.sh`). Any drift
between Terraform and reality fails locally.

## First-time bootstrap

The `millsymills-terraform-state` bucket already exists (created
by hand per the original CLAUDE.md runbook). The `import { ... }`
block in `main.tf` adopts it into state on first apply -- no
manual `terraform import` step required. State for this module
lives in the same bucket it manages, keyed under
`bootstrap-state/terraform.tfstate`.

```bash
cd infra/bootstrap-state
terraform init                  # downloads aws provider + wires
                                # the s3 backend at
                                # bootstrap-state/terraform.tfstate
terraform plan                  # confirm the plan ADOPTS the
                                # existing bucket and reconciles
                                # missing controls (versioning,
                                # policies, lifecycle) -- if it
                                # proposes RECREATING the bucket,
                                # STOP and investigate.
terraform apply
```

Once the bucket is in state, the `import` block is a no-op on every
subsequent plan.

## Green-field bootstrap (fresh account, no bucket yet)

The remote `s3` backend can't init against a bucket that doesn't
exist yet, and the `import` block can't adopt something that
doesn't exist either. Both must be neutralised for the very first
apply:

1. Edit `main.tf`: comment out the `backend "s3" { ... }` block
   (leaves an implicit local backend) AND the `import { ... }`
   block.
2. `terraform init && terraform apply` -- creates the bucket from
   scratch using the local backend.
3. Restore both blocks in `main.tf`.
4. `terraform init -migrate-state` -- copies the freshly-created
   local `terraform.tfstate` up to the bucket it now manages.
5. Delete the on-disk `terraform.tfstate*` files; the bucket is
   the source of truth from here on.

## Migrating an existing local state into the bucket

If you're upgrading from a deployment that pre-dates the remote
backend (i.e. you have a local `terraform.tfstate` on disk from a
prior local-backend apply), one-time migration:

```bash
cd infra/bootstrap-state
terraform init -migrate-state   # Terraform copies the local
                                # state up to s3://millsymills-
                                # terraform-state/bootstrap-state/
                                # terraform.tfstate and offers to
                                # remove the local copy.
terraform state list            # sanity-check resources match.
trash terraform.tfstate*        # remove the now-stale local copy.
```

The chicken-and-egg only bites on a brand-new account. For any
existing deployment (including this one) the bucket is already
populated, so the remote backend is just a wire-up rather than a
bootstrap step.

## Recovery

If a state object gets corrupted or deleted:

```bash
aws s3api list-object-versions \
  --bucket millsymills-terraform-state \
  --prefix millsymills.com/terraform.tfstate

aws s3api copy-object \
  --bucket millsymills-terraform-state \
  --copy-source 'millsymills-terraform-state/millsymills.com/terraform.tfstate?versionId=<VERSION>' \
  --key millsymills.com/terraform.tfstate
```

Object Lock and MFA Delete are intentionally NOT enabled --
both impose operational friction (object lock prevents lifecycle
expiry, MFA delete requires root credentials for every state
write) that's heavy for a single-operator personal site.
Versioning + lifecycle + the deliberate `prevent_destroy` on the
bucket cover the realistic recovery scenarios.

## Future: fully destroying a stack

The standard teardown (e.g. p41m0n per
`docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md`)
slims a stack down -- the state key stays active because Proton
catchall + Route53 zone + the account-wide IAM OIDC provider stay
live. If a stack is ever fully destroyed (domain expiry, rename,
account-level cleanup), the state object becomes an orphan: a
non-empty JSON in S3 with no live resources behind it.

```bash
# 1. Destroy whatever's left in the stack. Idempotent on an
#    already-empty state.
./scripts/tf.sh <stack> destroy

# 2. Delete the current-version state object. Versioning is on, so
#    the prior contents survive as noncurrent versions and are
#    reaped on their own schedule by the noncurrent-version
#    lifecycle (`var.noncurrent_version_retention_days`, default
#    365d). Until then they're recoverable per the "Recovery"
#    section above.
aws s3api delete-object \
  --bucket millsymills-terraform-state \
  --key <stack>/terraform.tfstate

# 3. (Optional) Delete the S3-native lockfile if one's lingering
#    from a crashed apply.
aws s3api delete-object \
  --bucket millsymills-terraform-state \
  --key <stack>/terraform.tfstate.tflock
```

In the same commit, remove `infra/stacks/<stack>.tfvars` and
`infra/stacks/<stack>.backend.hcl` so `scripts/tf.sh` stops
recognising the stack name. Leaving those files behind without a
live state key produces a confusing "stack exists but plan
fails" mode for the next operator.
