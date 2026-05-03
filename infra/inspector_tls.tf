# Inspector TLS Lambda for the /inspector/ app.
#
# Architecture: a tiny Node.js Lambda exposed via Function URL. CloudFront
# adds an origin pointing at that URL, plus a cache behavior matching
# /api/tls/* that uses the AWS-managed origin-request policy
# "Managed-AllViewerAndCloudFrontHeaders-2022-06" so the
# `cloudfront-viewer-tls` header (negotiated TLS protocol, cipher, SNI)
# survives the origin hop. The Lambda parses that header and returns
# JSON; the inspector front-end fetches /api/tls/inspect and renders the
# result.
#
# Why not Lambda@Edge? Edge functions can't be reasonably tested locally,
# can only run in us-east-1, and have a stricter deploy lifecycle. A
# regional Lambda + Function URL behind CloudFront gets us the same
# user→CloudFront TLS visibility with none of the edge-specific
# overhead. Pennies/year on traffic — same cost class as ct_monitor.

locals {
  inspector_tls_name = "${replace(var.domain, ".", "-")}-inspector-tls"
}

data "archive_file" "inspector_tls" {
  type        = "zip"
  source_file = "${path.module}/inspector_tls.mjs"
  output_path = "${path.module}/.terraform/inspector_tls.zip"
}

resource "aws_iam_role" "inspector_tls" {
  name = "${local.inspector_tls_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "inspector_tls_basic" {
  role       = aws_iam_role.inspector_tls.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Pre-create the log group so retention is owned by Terraform; otherwise
# Lambda creates it on first invoke with retention=Never.
resource "aws_cloudwatch_log_group" "inspector_tls" {
  name              = "/aws/lambda/${local.inspector_tls_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "inspector_tls" {
  function_name    = local.inspector_tls_name
  role             = aws_iam_role.inspector_tls.arn
  filename         = data.archive_file.inspector_tls.output_path
  source_code_hash = data.archive_file.inspector_tls.output_base64sha256
  handler          = "inspector_tls.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  memory_size      = 128

  depends_on = [aws_cloudwatch_log_group.inspector_tls]
}

# Function URL is the public origin CloudFront will forward to. Auth
# NONE because the data is intentionally public — TLS metadata is not a
# secret — and the only "auth" we need is "the request came through
# CloudFront with a viewer-TLS header." That part we inspect at the
# Lambda by reading the header presence.
resource "aws_lambda_function_url" "inspector_tls" {
  function_name      = aws_lambda_function.inspector_tls.function_name
  authorization_type = "NONE"
}

# Strip the `https://` and any trailing slash from the function URL so
# CloudFront's `domain_name` (host only) accepts it. The URL shape is
# `https://<id>.lambda-url.<region>.on.aws/`, stable across deploys for
# a given function name.
locals {
  inspector_tls_origin_host = replace(replace(aws_lambda_function_url.inspector_tls.function_url, "https://", ""), "/", "")
}
