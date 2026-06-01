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
  inspector_tls_name = "${local.domain_slug}-inspector-tls"
}

data "archive_file" "inspector_tls" {
  type        = "zip"
  source_file = "${path.module}/inspector_tls.mjs"
  output_path = "${path.module}/.terraform/inspector_tls.zip"
}

resource "aws_iam_role" "inspector_tls" {
  count = var.enable_inspector_tls ? 1 : 0

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
  count = var.enable_inspector_tls ? 1 : 0

  role       = aws_iam_role.inspector_tls[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Pre-create the log group so retention is owned by Terraform; otherwise
# Lambda creates it on first invoke with retention=Never.
resource "aws_cloudwatch_log_group" "inspector_tls" {
  count = var.enable_inspector_tls ? 1 : 0

  name              = "/aws/lambda/${local.inspector_tls_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "inspector_tls" {
  count = var.enable_inspector_tls ? 1 : 0

  function_name    = local.inspector_tls_name
  role             = aws_iam_role.inspector_tls[0].arn
  filename         = data.archive_file.inspector_tls.output_path
  source_code_hash = data.archive_file.inspector_tls.output_base64sha256
  handler          = "inspector_tls.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  memory_size      = 128

  depends_on = [aws_cloudwatch_log_group.inspector_tls[0]]
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
  count = var.enable_inspector_tls ? 1 : 0

  function_name      = aws_lambda_function.inspector_tls[0].function_name
  authorization_type = "AWS_IAM"
}

# CloudFront OAC for the Lambda Function URL. CloudFront sigv4-signs
# every origin request; the Lambda permission below restricts the
# resource policy to the CloudFront service principal scoped via
# source_arn to this specific distribution.
#
# Deploy-time note: aws_lambda_permission.inspector_tls_cloudfront has
# no dependency edge from aws_cloudfront_distribution.site (it can't —
# the permission's source_arn references the distribution's arn, so
# inverting the dependency would cycle). On first apply, CloudFront
# may finish propagating the OAC change before the permission lands;
# during that window CloudFront-signed requests get 403 from Lambda,
# which the distribution-level custom_error_response converts to
# /404.html. Subsequent applies are unaffected because the permission
# already exists.
resource "aws_cloudfront_origin_access_control" "inspector_tls" {
  count = var.enable_inspector_tls ? 1 : 0

  name                              = local.inspector_tls_name
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Allow CloudFront — and only CloudFront, only this distribution — to
# invoke the Function URL. AWS_IAM auth on the URL means an unsigned
# direct call from the public internet returns 403, so the bypass path
# the /security/ page implicitly disclaimed is closed.
#
# Lambda Function URLs created after AWS's October 2025 authorization
# change require BOTH permissions below: `InvokeFunctionUrl` authorizes
# the URL surface, while `InvokeFunction` authorizes the underlying
# function invocation. Without the second statement CloudFront OAC signs
# correctly but Lambda rejects the request before invoking the function.
resource "aws_lambda_permission" "inspector_tls_cloudfront" {
  count = var.enable_inspector_tls ? 1 : 0

  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.inspector_tls[0].function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "inspector_tls_cloudfront_invoke" {
  count = var.enable_inspector_tls ? 1 : 0

  statement_id             = "AllowCloudFrontServicePrincipalInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.inspector_tls[0].function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.site.arn
  invoked_via_function_url = true
}

# Strip the `https://` and any trailing slash from the function URL so
# CloudFront's `domain_name` (host only) accepts it. The URL shape is
# `https://<id>.lambda-url.<region>.on.aws/`, stable across deploys for
# a given function name.
locals {
  inspector_tls_origin_host = var.enable_inspector_tls ? replace(replace(aws_lambda_function_url.inspector_tls[0].function_url, "https://", ""), "/", "") : null
}

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_iam_role.inspector_tls
  to   = aws_iam_role.inspector_tls[0]
}

moved {
  from = aws_iam_role_policy_attachment.inspector_tls_basic
  to   = aws_iam_role_policy_attachment.inspector_tls_basic[0]
}

moved {
  from = aws_cloudwatch_log_group.inspector_tls
  to   = aws_cloudwatch_log_group.inspector_tls[0]
}

moved {
  from = aws_lambda_function.inspector_tls
  to   = aws_lambda_function.inspector_tls[0]
}

moved {
  from = aws_lambda_function_url.inspector_tls
  to   = aws_lambda_function_url.inspector_tls[0]
}

moved {
  from = aws_cloudfront_origin_access_control.inspector_tls
  to   = aws_cloudfront_origin_access_control.inspector_tls[0]
}

moved {
  from = aws_lambda_permission.inspector_tls_cloudfront
  to   = aws_lambda_permission.inspector_tls_cloudfront[0]
}
