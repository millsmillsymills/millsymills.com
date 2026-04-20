terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
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
