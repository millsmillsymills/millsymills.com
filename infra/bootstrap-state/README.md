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
by hand per the original CLAUDE.md runbook). Import it instead of
creating a duplicate.

```bash
cd infra/bootstrap-state
terraform init                  # local backend; downloads aws provider
terraform import \
  aws_s3_bucket.state \
  millsymills-terraform-state
terraform plan                  # confirm the plan only reconciles
                                # missing controls (versioning,
                                # policies, lifecycle) -- if it
                                # proposes RECREATING the bucket,
                                # STOP and investigate.
terraform apply
```

For a green-field account where the bucket does not yet exist,
skip the `import` step -- `apply` will create it.

After `apply`, `terraform.tfstate` lives in this directory under
the local backend. **Do not commit it.** A `.gitignore` entry
covers `*.tfstate*` already.

## Optional: migrate state into the bucket

To get the bootstrap module's own state out of the local
filesystem and into S3 (under a distinct key from the site
stacks), edit the backend block at the top of `main.tf`:

```terraform
  backend "s3" {
    bucket       = "millsymills-terraform-state"
    key          = "bootstrap-state/terraform.tfstate"
    region       = "us-west-2"
    encrypt      = true
    use_lockfile = true
  }
```

Then:

```bash
terraform init -migrate-state
```

Terraform copies the local state up to the bucket. `terraform
state list` should still show the same resources after migration.

This step is optional: the local backend is fine for a
single-operator setup, and keeping it local avoids the one-day
chicken-and-egg loop where migrating bootstrap state into a
broken bucket would lock out recovery. Decide based on whether
the bucket needs to be reachable to multiple operators.

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
