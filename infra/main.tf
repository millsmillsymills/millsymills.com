terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
    }
  }

  # Uncomment after creating the S3 backend bucket manually with
  # versioning and SSE-S3 enabled. `use_lockfile = true` requires
  # Terraform >= 1.10 (S3-native locking, no DynamoDB table needed).
  # backend "s3" {
  #   bucket       = "millsymills-terraform-state"
  #   key          = "millsymills.com/terraform.tfstate"
  #   region       = "us-east-1"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region
}

# ACM must be in us-east-1 for CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
