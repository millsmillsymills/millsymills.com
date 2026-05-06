# Inspector TLS Lambda for the /inspector/ app.
#
# Architecture: a tiny Node.js Lambda exposed via Function URL. CloudFront
# adds an origin pointing at that URL, plus a cache behavior matching
# /api/tls/* that uses the custom origin-request policy
# `aws_cloudfront_origin_request_policy.inspector_tls` (defined in
# infra/cloudfront.tf). That policy whitelists only `CloudFront-Viewer-TLS`
# (the negotiated TLS protocol/cipher/SNI we surface) and `Origin` (used
# for the CORS allow-origin echo); Host is intentionally NOT forwarded so
# CloudFront rewrites it to the Lambda Function URL hostname. Lambda
# Function URLs reject any request whose Host header does not match
# `<id>.lambda-url.<region>.on.aws` with 403, so forwarding the viewer's
# Host (e.g. millsymills.com) — as the AWS-managed
# `Managed-AllViewerAndCloudFrontHeaders-2022-06` policy does — would
# 403 every CloudFront request and CloudFront would substitute /404.html
# via custom_error_response. See `aws_cloudfront_origin_request_policy.inspector_tls`
# in infra/cloudfront.tf for the matching commentary.
#
# The Lambda parses the forwarded TLS header and returns JSON; the
# inspector front-end fetches /api/tls/inspect and renders the result.
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

# Function URL is the origin CloudFront forwards to. Locked to AWS_IAM
# auth and only invokable by the CloudFront service principal scoped to
# our distribution (see aws_lambda_permission below). Without this, the
# raw `<id>.lambda-url.<region>.on.aws` endpoint would be publicly
# reachable, which means a direct caller bypasses the CloudFront layer
# (HSTS / CSP / COOP / COEP / CORP / X-Content-Type-Options /
# Referrer-Policy / Permissions-Policy) and the WAF / OAC chain. The
# /security/ page promises every response ships those headers; that
# claim is only true for `millsymills.com/api/tls/inspect`, not for the
# raw Function URL — so we close the bypass at the Lambda boundary.
resource "aws_lambda_function_url" "inspector_tls" {
  function_name      = aws_lambda_function.inspector_tls.function_name
  authorization_type = "AWS_IAM"
}

# CloudFront OAC for the Lambda Function URL. Mirrors the S3 OAC pattern
# in s3.tf: CloudFront sigv4-signs every origin request, the Lambda
# permission below restricts who can invoke the URL to CloudFront
# itself, scoped via source_arn to this distribution.
resource "aws_cloudfront_origin_access_control" "inspector_tls" {
  name                              = local.inspector_tls_name
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Allow CloudFront — and only CloudFront, only this distribution — to
# invoke the Function URL. AWS_IAM auth on the URL means an unsigned
# direct call from the public internet returns 403, so the bypass path
# the /security/ page implicitly disclaimed is closed.
resource "aws_lambda_permission" "inspector_tls_cloudfront" {
  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.inspector_tls.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

# Strip the `https://` and any trailing slash from the function URL so
# CloudFront's `domain_name` (host only) accepts it. The URL shape is
# `https://<id>.lambda-url.<region>.on.aws/`, stable across deploys for
# a given function name.
locals {
  inspector_tls_origin_host = replace(replace(aws_lambda_function_url.inspector_tls.function_url, "https://", ""), "/", "")
}
