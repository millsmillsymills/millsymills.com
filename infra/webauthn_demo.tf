# WebAuthn / passkey demo backend (issue #140) -- infra scaffold slice.
#
# Ships the Lambda Function URL + DynamoDB credential store + IAM role
# only. The handler is a stub returning 200 (see
# `infra/lambdas/webauthn_demo/index.mjs`); a followup PR replaces it
# with the real `@simplewebauthn/server`-backed registration +
# authentication flows. The `/demo/passkey` Astro page and the
# CloudFront-vs-direct-Function-URL decision are separate followups
# tracked under #140.
#
# Architecture differs from `infra/csp_report.tf` / `infra/inspector_tls.tf`
# in one place: the Function URL is `authorization_type = "NONE"` (public)
# rather than `AWS_IAM` behind a CloudFront OAC. That's a deliberate
# slice-level decision -- the followup CloudFront-slice PR will revisit
# it. The demo collects no PII; credentials are ephemeral (TTL'd) and
# origin-bound at the application layer by the real handler. Until that
# handler lands the stub returns a static body and ignores the table.
#
# Cost guard: reserved_concurrent_executions = 5 mirrors csp_report --
# a runaway demo cannot blow the account budget.

locals {
  webauthn_demo_name = "${replace(var.domain, ".", "-")}-webauthn-demo"
}

# --------------------------------------------------------------------
# DynamoDB credential store.
#
# Schema is the bare minimum the followup logic-slice will extend:
# `credentialId` (hash key) is the WebAuthn credential identifier;
# `expiresAt` is an epoch-seconds TTL attribute so DynamoDB purges
# stale demo registrations automatically. The followup PR adds
# `publicKey`, `counter`, `userHandle`, `transports` -- DynamoDB is
# schemaless so those land without a migration.
# --------------------------------------------------------------------

resource "aws_dynamodb_table" "webauthn_credentials" {
  name         = local.webauthn_demo_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "credentialId"

  attribute {
    name = "credentialId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

# --------------------------------------------------------------------
# Lambda function + Function URL.
# --------------------------------------------------------------------

data "archive_file" "webauthn_demo" {
  type        = "zip"
  source_file = "${path.module}/lambdas/webauthn_demo/index.mjs"
  output_path = "${path.module}/.terraform/webauthn_demo.zip"
}

resource "aws_iam_role" "webauthn_demo" {
  name = "${local.webauthn_demo_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Pre-create the log group so retention is owned by Terraform; otherwise
# Lambda creates it on first invoke with retention=Never.
resource "aws_cloudwatch_log_group" "webauthn_demo" {
  name              = "/aws/lambda/${local.webauthn_demo_name}"
  retention_in_days = 14
}

# Least-priv: the basic execution role grants logs:* on every log group
# in the account, which is broader than this Lambda needs. Inline the
# log-group-scoped CRUD instead, matching the resource-scoped pattern
# we use for DynamoDB below.
resource "aws_iam_role_policy" "webauthn_demo" {
  name = "webauthn-demo"
  role = aws_iam_role.webauthn_demo.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = [
          aws_cloudwatch_log_group.webauthn_demo.arn,
          "${aws_cloudwatch_log_group.webauthn_demo.arn}:*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]
        Resource = aws_dynamodb_table.webauthn_credentials.arn
      },
    ]
  })
}

resource "aws_lambda_function" "webauthn_demo" {
  function_name    = local.webauthn_demo_name
  role             = aws_iam_role.webauthn_demo.arn
  filename         = data.archive_file.webauthn_demo.output_path
  source_code_hash = data.archive_file.webauthn_demo.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  memory_size      = 128

  # Cap concurrent invocations so a runaway demo cannot blow the bill.
  # 5 leaves headroom for normal demo traffic; bursts beyond that get
  # throttled, which is the desired posture for a public no-auth
  # endpoint.
  reserved_concurrent_executions = 5

  environment {
    variables = {
      WEBAUTHN_TABLE = aws_dynamodb_table.webauthn_credentials.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.webauthn_demo]
}

# Public Function URL. No CloudFront OAC fronting -- the
# direct-vs-CloudFront-origin decision is deferred to a followup PR
# (see header comment + issue #140). CORS allows only `https://<domain>`
# so a browser on any other origin cannot exercise the endpoint.
resource "aws_lambda_function_url" "webauthn_demo" {
  function_name      = aws_lambda_function.webauthn_demo.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["https://${var.domain}"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 86400
  }
}

output "webauthn_demo_url" {
  description = "Public HTTPS endpoint for the WebAuthn demo Lambda. Wire this into the `/demo/passkey` Astro page in the followup page-slice PR (#140)."
  value       = aws_lambda_function_url.webauthn_demo.function_url
}
