# GitHub Actions OIDC provider + deploy role.
#
# The deploy role is gated on three OIDC token claims, all required:
#   - aud: must equal `sts.amazonaws.com`
#   - sub: must match the GitHub Environment form
#          (`repo:<owner/name>:environment:<env>`) — see below
#   - job_workflow_ref: must match the exact workflow file on the
#          deploy branch (so a different or tampered workflow cannot
#          mint the token)
#
# When a job declares `environment:`, GitHub overrides the OIDC sub
# claim from the ref form (`repo:owner/name:ref:refs/heads/main`) to
# the environment form (`repo:owner/name:environment:<env_name>`).
# The deploy workflow targets an environment, so the trust policy
# matches the environment form. The branch is still pinned via
# `job_workflow_ref` (`@refs/heads/${deploy_branch}`). A ref-form
# trust policy returned `Not authorized to perform
# sts:AssumeRoleWithWebIdentity` even when the workflow file and
# branch were correct, so the environment form is load-bearing.
#
# Rotate `var.github_repo`, `var.deploy_branch`, `var.deploy_workflow`,
# or `var.deploy_environment` if any of those change.
#
# AWS no longer validates the OIDC thumbprint strictly against GitHub's
# cert, so the value below (a long-standing GitHub token.actions root
# thumbprint) is kept for Terraform's requirement but does not need to
# be updated when GitHub rotates certs.

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_deploy_trust" {
  count = var.enable_github_deploy_role ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Environment form of the sub claim — see header. The branch is
    # still pinned via `job_workflow_ref` below.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.deploy_environment}"]
    }

    # Pin which workflow file may mint this token. Without this, a maintainer
    # who modifies a different workflow on `deploy_branch` (or adds a new one)
    # could assume the role with arbitrary job content. Reduces blast radius
    # if the maintainer account is compromised.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = ["${var.github_repo}/.github/workflows/${var.deploy_workflow}@refs/heads/${var.deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name               = "${local.domain_slug}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust[0].json
  description        = "Assumed by GitHub Actions for ${var.github_repo} (${var.deploy_branch}) to deploy ${var.domain}."
}

data "aws_iam_policy_document" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  statement {
    sid    = "SyncSiteObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObject",
    ]
    resources = ["${aws_s3_bucket.site.arn}/*"]
  }

  statement {
    sid    = "ListSiteBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.site.arn]
  }

  statement {
    sid    = "InvalidateDistribution"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
    ]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name   = "deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}

output "github_deploy_role_arn" {
  description = "Pass this to the GitHub Actions deploy workflow as the AWS_DEPLOY_ROLE_ARN env-scoped variable on the matching GitHub Environment (production for deploy.yml). Null on stacks with `enable_github_deploy_role = false` (no per-stack deploy role provisioned). `terraform output -raw github_deploy_role_arn` errors loudly on null with `Unsupported value for raw output`, so the runbook copy-paste step fails fast rather than silently passing an empty string to GitHub. The deploy workflow itself is never invoked on a stack without the role (deploy.yml only targets millsymills today), so the null case has no automated consumer."
  value       = var.enable_github_deploy_role ? aws_iam_role.github_deploy[0].arn : null
}

# moved blocks: preserve state addresses across the count = ... gating above.
# aws_iam_openid_connect_provider.github stays unconditional (account-wide
# resource shared across all stacks in this account).

moved {
  from = aws_iam_role.github_deploy
  to   = aws_iam_role.github_deploy[0]
}

moved {
  from = aws_iam_role_policy.github_deploy
  to   = aws_iam_role_policy.github_deploy[0]
}
