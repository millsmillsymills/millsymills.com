# CSP report endpoint — accepts violation reports posted by browsers at
# /api/csp-report and persists them to S3 with a 30-day lifecycle.
#
# Architecture mirrors `infra/inspector_tls.tf`: a tiny Node.js Lambda
# behind a Function URL locked to `AWS_IAM` auth + a CloudFront Origin
# Access Control. The CloudFront cache behavior `/api/csp-report` (in
# `infra/cloudfront.tf`) sigv4-signs every origin request, so the only
# path to the Lambda is through the distribution. Direct calls to the
# raw `<id>.lambda-url.<region>.on.aws` endpoint return 403, preserving
# every CloudFront-applied security header on the response.
#
# Browser report formats accepted (see `infra/csp_report.mjs`):
#   * `application/reports+json` — Reporting API (`Reporting-Endpoints` +
#     `report-to csp` in CSP).
#   * `application/csp-report` — legacy `report-uri` directive payload.
#   * `application/json` — older Firefox quirk for `report-uri`.
#
# Cost guard: Lambda is pinned to `reserved_concurrent_executions = 5`
# so a flood of reports cannot run up the bill. Oversize bodies are
# rejected at the handler with 413 before the S3 write. Reports older
# than 30 days are deleted by the bucket's lifecycle rule — well above
# the 30-day floor in #131 and short enough that the bucket never grows
# unboundedly.

locals {
  csp_report_name        = "${replace(var.domain, ".", "-")}-csp-report"
  csp_report_bucket_name = "${var.domain}-csp-reports"
}

# --------------------------------------------------------------------
# S3 bucket for persisted reports.
# --------------------------------------------------------------------

resource "aws_s3_bucket" "csp_report" {
  bucket = local.csp_report_bucket_name
}

resource "aws_s3_bucket_public_access_block" "csp_report" {
  bucket = aws_s3_bucket.csp_report.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "csp_report" {
  bucket = aws_s3_bucket.csp_report.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "csp_report" {
  bucket = aws_s3_bucket.csp_report.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "csp_report" {
  bucket = aws_s3_bucket.csp_report.id

  rule {
    id     = "expire-csp-reports"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "csp_report" {
  bucket = aws_s3_bucket.csp_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Defense-in-depth: refuse any non-TLS access. Lambda PutObject
        # already uses HTTPS; this only affects future IAM principals
        # or read tooling that might otherwise reach the bucket.
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.csp_report.arn,
          "${aws_s3_bucket.csp_report.arn}/*",
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

# --------------------------------------------------------------------
# Lambda function + Function URL.
# --------------------------------------------------------------------

data "archive_file" "csp_report" {
  type        = "zip"
  source_file = "${path.module}/csp_report.mjs"
  output_path = "${path.module}/.terraform/csp_report.zip"
}

resource "aws_iam_role" "csp_report" {
  name = "${local.csp_report_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "csp_report_basic" {
  role       = aws_iam_role.csp_report.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "csp_report_put" {
  name = "put-reports"
  role = aws_iam_role.csp_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:PutObject"
      Resource = "${aws_s3_bucket.csp_report.arn}/reports/*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "csp_report" {
  name              = "/aws/lambda/${local.csp_report_name}"
  retention_in_days = 30
}

resource "aws_lambda_function" "csp_report" {
  function_name    = local.csp_report_name
  role             = aws_iam_role.csp_report.arn
  filename         = data.archive_file.csp_report.output_path
  source_code_hash = data.archive_file.csp_report.output_base64sha256
  handler          = "csp_report.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  memory_size      = 128

  # Cap concurrent invocations so a flood of reports cannot run up the
  # bill or starve other functions in the account. 5 leaves plenty of
  # headroom for normal browser-violation traffic; bursts beyond that
  # get throttled, which is the desired DoS posture.
  reserved_concurrent_executions = 5

  environment {
    variables = {
      REPORT_BUCKET = aws_s3_bucket.csp_report.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.csp_report]
}

resource "aws_lambda_function_url" "csp_report" {
  function_name      = aws_lambda_function.csp_report.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_cloudfront_origin_access_control" "csp_report" {
  name                              = local.csp_report_name
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Lambda permission scoped to this distribution's ARN. Same caveat as
# inspector_tls — the trust direction (permission references the
# distribution arn) means there's no Terraform dependency edge from
# the distribution; on first apply, CloudFront may finish propagating
# the OAC change before the permission lands and CloudFront-signed
# requests get 403 from Lambda for a brief window.
resource "aws_lambda_permission" "csp_report_cloudfront" {
  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.csp_report.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

locals {
  csp_report_origin_host = replace(replace(aws_lambda_function_url.csp_report.function_url, "https://", ""), "/", "")
}
