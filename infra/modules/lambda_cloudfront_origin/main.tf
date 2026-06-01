terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# Always built (matches the original uncounted data sources); cheap and
# referenced only by the count-gated function below.
data "archive_file" "this" {
  type        = "zip"
  source_file = var.source_file
  output_path = "${dirname(var.source_file)}/.terraform/${var.name}.zip"
}

resource "aws_iam_role" "this" {
  count = var.enabled ? 1 : 0

  name = "${var.name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  count = var.enabled ? 1 : 0

  role       = aws_iam_role.this[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Pre-create the log group so retention is owned by Terraform; otherwise
# Lambda creates it on first invoke with retention=Never.
resource "aws_cloudwatch_log_group" "this" {
  count = var.enabled ? 1 : 0

  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  count = var.enabled ? 1 : 0

  function_name    = var.name
  role             = aws_iam_role.this[0].arn
  filename         = data.archive_file.this.output_path
  source_code_hash = data.archive_file.this.output_base64sha256
  handler          = var.handler
  runtime          = var.runtime
  architectures    = var.architectures
  timeout          = var.timeout
  memory_size      = var.memory_size

  reserved_concurrent_executions = var.reserved_concurrent_executions

  dynamic "environment" {
    for_each = length(var.environment) > 0 ? [1] : []
    content {
      variables = var.environment
    }
  }

  depends_on = [aws_cloudwatch_log_group.this[0]]
}

# Function URL is the origin CloudFront forwards to. Locked to AWS_IAM auth
# and only invokable by the CloudFront service principal scoped to the
# distribution (see the permissions below). Without this the raw
# `<id>.lambda-url.<region>.on.aws` endpoint would be publicly reachable,
# bypassing every CloudFront-applied security header and the OAC chain.
resource "aws_lambda_function_url" "this" {
  count = var.enabled ? 1 : 0

  function_name      = aws_lambda_function.this[0].function_name
  authorization_type = "AWS_IAM"
}

resource "aws_cloudfront_origin_access_control" "this" {
  count = var.enabled ? 1 : 0

  name                              = var.name
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Allow CloudFront — and only CloudFront, only this distribution — to
# invoke the Function URL.
#
# Lambda Function URLs created after AWS's October 2025 authorization
# change require BOTH permissions: `InvokeFunctionUrl` authorizes the URL
# surface, while `InvokeFunction` authorizes the underlying function
# invocation. Without the second statement CloudFront OAC signs correctly
# but Lambda rejects the request before invoking the function.
#
# The original flat resources carried an explicit
# `depends_on = [aws_cloudfront_distribution.site]` to force the permission
# to land after the distribution rather than racing OAC propagation on
# first apply. Here that ordering is the data-flow edge created by
# `var.distribution_arn` (which the caller wires to the distribution's
# arn), so no explicit depends_on is needed.
resource "aws_lambda_permission" "cloudfront" {
  count = var.enabled ? 1 : 0

  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.this[0].function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = var.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  count = var.enabled ? 1 : 0

  statement_id             = "AllowCloudFrontServicePrincipalInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.this[0].function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = var.distribution_arn
  invoked_via_function_url = true
}
