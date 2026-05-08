# Bootstrap module for the Terraform state bucket itself.
#
# The site stacks (`infra/`) use an S3 backend that points at this
# bucket. Until the bucket exists, no stack can `terraform init`.
# That chicken-and-egg is why this module is a separate root with
# its own backend (local, by default) -- once the bucket exists,
# state for THIS module can optionally migrate into the bucket it
# manages, under a distinct key (see README.md for the migration
# step). Bootstrap-state controls the trust root for everything
# else, so the audit trail (versioning, SSE, TLS-only policy,
# public-access-block, lifecycle) needs to be reviewable in
# Terraform rather than configured by hand and forgotten.
#
# Closes the codification half of #283. The matching read-only
# audit script (`scripts/verify-state-bucket.sh`) checks the live
# bucket against the same controls and is wired opt-in into
# `scripts/ci-local.sh`.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
  }

  # Local backend by default. After first apply (or after
  # `terraform import` against an existing manually-created
  # bucket), this can optionally migrate to the same S3 bucket
  # under a distinct key. See README.md.
  backend "local" {}
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "AWS region the state bucket lives in. Site stacks' backend.hcl files must point at the same region."
  type        = string
  default     = "us-west-2"
}

variable "bucket_name" {
  description = "Name of the S3 bucket holding Terraform state for every site stack."
  type        = string
  default     = "millsymills-terraform-state"
}

variable "noncurrent_version_retention_days" {
  description = "How long to keep noncurrent state versions before lifecycle deletes them. State files are tiny but bound the long-tail cost; 365d is well above any realistic recovery window."
  type        = number
  default     = 365
}

resource "aws_s3_bucket" "state" {
  bucket = var.bucket_name

  # Belt-and-suspenders against an unrelated `terraform destroy`
  # accidentally targeting this resource. Removing the bucket would
  # take every site stack's state with it.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning is the recovery story for an accidental `terraform
# state rm` or a bad apply that overwrote state -- we can roll back
# to the previous object version. Required by #283's acceptance
# criteria.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      # SSE-S3. Switching to SSE-KMS adds key-management overhead
      # and a per-request KMS cost; the bucket itself is private
      # and already TLS-only, and Terraform state is encrypted
      # in-transit by `encrypt = true` in backend.hcl. SSE-S3 is
      # the right tradeoff for a single-account, single-operator
      # state bucket.
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# TLS-only access. Defense-in-depth against a future IAM principal
# that might otherwise reach the bucket over plain HTTP. Mirrors
# the same `aws:SecureTransport` pattern used by the site / log /
# csp-report buckets.
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.state.arn,
          "${aws_s3_bucket.state.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

# Lifecycle: keep noncurrent versions for a year, then expire. State
# files are tiny so the cost guard is more about long-tail cruft
# than dollars; 365d leaves plenty of recovery slack.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

output "bucket_name" {
  value       = aws_s3_bucket.state.id
  description = "Name of the state bucket. Should match every infra/stacks/*.backend.hcl `bucket` field."
}

output "bucket_arn" {
  value       = aws_s3_bucket.state.arn
  description = "ARN of the state bucket. Useful when scoping IAM policies for future operators."
}
