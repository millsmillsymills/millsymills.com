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
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
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

# GitHub provider — manages repo-level controls (currently just the `main`
# branch protection rule, see `github_branch_protection.tf`). `owner` is
# derived from `var.github_repo` (the `owner/name` form already validated in
# `variables.tf`). `token` comes from `var.github_token` (sensitive); set it
# at apply time via `TF_VAR_github_token=$(gh auth token)` so the token
# never lands in tfvars on disk.
provider "github" {
  owner = split("/", var.github_repo)[0]
  token = var.github_token
}
