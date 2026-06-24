terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # All backend fields (bucket, key, region, encrypt, use_lockfile) are
  # supplied per-stack via `terraform init -backend-config=...`. See
  # infra/stacks/*.backend.hcl and scripts/tf.sh. An empty block here is
  # required for Terraform to recognize the S3 backend at all.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# ACM must be in us-east-1 for CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Account ID is referenced from infra/dnssec.tf (KMS key policy) and
# infra/s3.tf (logs-bucket policy SourceAccount/SourceArn). Lives here
# rather than in cloudfront_logging.tf so it survives any future
# conditional gating of the cloudfront-logging resources.
data "aws_caller_identity" "current" {}

# Dotless form of the domain (millsymills.com -> millsymills-com), used as
# the prefix for resource names that can't contain dots (Lambda functions,
# IAM roles, CloudFront policies, log groups). Hoisted here so the one
# transform isn't restated at 20+ call sites across the stack.
locals {
  domain_slug = replace(var.domain, ".", "-")
}
