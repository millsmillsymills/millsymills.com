# Hit-counter endpoint -- served at /api/hits, increments a single
# DynamoDB counter and returns JSON. Backs the web-1.0 hit-counter pixel
# in the taskbar chrome. Closes #468.
#
# Architecture mirrors `infra/csp_report.tf`: a tiny Node.js Lambda
# behind a Function URL locked to `AWS_IAM` auth + a CloudFront Origin
# Access Control. The CloudFront cache behavior `/api/hits` (in
# `infra/cloudfront.tf`) sigv4-signs every origin request, so the only
# path to the Lambda is through the distribution. Direct calls to the
# raw `<id>.lambda-url.<region>.on.aws` endpoint return 403, preserving
# every CloudFront-applied security header on the response.
#
# Storage: single DynamoDB item, atomic `ADD` increment via UpdateItem.
# Single-item keeps the table at the smallest possible footprint
# (PAY_PER_REQUEST, no provisioned capacity); per-path counters were
# considered (#468 brief) and deferred -- they'd add write hotness and
# the public hit-counter doesn't care about per-path stats.
#
# Cost guard: Lambda is pinned to `reserved_concurrent_executions = 10`
# so a flood of GETs cannot run up the bill. DynamoDB on-demand cost
# tracks invocation count one-to-one.

locals {
  hits_name = "${replace(var.domain, ".", "-")}-hits"
}

# --------------------------------------------------------------------
# DynamoDB table -- single sentinel item `pk = "hits"`.
# --------------------------------------------------------------------

resource "aws_dynamodb_table" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  name         = local.hits_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    # Counter resets on disaster are acceptable; PITR adds storage
    # cost for a single-row table without commensurate value.
    enabled = false
  }

  server_side_encryption {
    enabled = true
  }
}

# --------------------------------------------------------------------
# Lambda function + Function URL.
# --------------------------------------------------------------------

data "archive_file" "hits" {
  type        = "zip"
  source_file = "${path.module}/hits.mjs"
  output_path = "${path.module}/.terraform/hits.zip"
}

resource "aws_iam_role" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  name = "${local.hits_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "hits_basic" {
  count = var.enable_hitcounter ? 1 : 0

  role       = aws_iam_role.hits[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "hits_ddb" {
  count = var.enable_hitcounter ? 1 : 0

  name = "ddb-update"
  role = aws_iam_role.hits[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      # UpdateItem is the only operation the handler issues; `ADD`
      # expression performs the read-modify-write atomically, so
      # no GetItem permission is needed.
      Action   = "dynamodb:UpdateItem"
      Resource = aws_dynamodb_table.hits[0].arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  name              = "/aws/lambda/${local.hits_name}"
  retention_in_days = 30
}

resource "aws_lambda_function" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  function_name    = local.hits_name
  role             = aws_iam_role.hits[0].arn
  filename         = data.archive_file.hits.output_path
  source_code_hash = data.archive_file.hits.output_base64sha256
  handler          = "hits.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  memory_size      = 128

  # Bill cap. 10 leaves plenty of headroom for normal taskbar traffic
  # (one GET per page load); bursts beyond that get throttled, which
  # is the desired DoS posture.
  reserved_concurrent_executions = 10

  environment {
    variables = {
      HITS_TABLE = aws_dynamodb_table.hits[0].name
    }
  }

  depends_on = [aws_cloudwatch_log_group.hits[0]]
}

resource "aws_lambda_function_url" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  function_name      = aws_lambda_function.hits[0].function_name
  authorization_type = "AWS_IAM"
}

resource "aws_cloudfront_origin_access_control" "hits" {
  count = var.enable_hitcounter ? 1 : 0

  name                              = local.hits_name
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Same trust-direction caveat as csp_report -- `source_arn` references
# the distribution arn but Terraform doesn't infer a dependency edge.
# Make the ordering explicit so the permission lands after the
# distribution rather than racing OAC propagation on first apply.
resource "aws_lambda_permission" "hits_cloudfront" {
  count = var.enable_hitcounter ? 1 : 0

  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.hits[0].function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"

  depends_on = [aws_cloudfront_distribution.site]
}

locals {
  hits_origin_host = var.enable_hitcounter ? trimsuffix(
    replace(aws_lambda_function_url.hits[0].function_url, "https://", ""),
    "/",
  ) : null
}

# --------------------------------------------------------------------
# Operational alarms.
#
# Two failure modes worth alerting on, mirrors csp_report's posture:
#   1. Throttling -- bills cap is hit -> counter freezes for viewers.
#   2. DDB UpdateItem failures -- IAM, throttling, or table issues.
# --------------------------------------------------------------------

resource "aws_sns_topic" "hits_ops" {
  count = var.enable_hitcounter ? 1 : 0

  name = "${local.hits_name}-ops"
}

resource "aws_sns_topic_subscription" "hits_ops_email" {
  count = var.enable_hitcounter ? 1 : 0

  topic_arn = aws_sns_topic.hits_ops[0].arn
  protocol  = "email"
  endpoint  = local.ct_alert_email
}

resource "aws_cloudwatch_metric_alarm" "hits_throttles" {
  count = var.enable_hitcounter ? 1 : 0

  alarm_name          = "${local.hits_name}-throttles"
  alarm_description   = "hits Lambda was throttled -- bursts beyond reserved_concurrent_executions are silently dropping counter increments."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.hits_ops[0].arn]
  ok_actions          = [aws_sns_topic.hits_ops[0].arn]

  dimensions = {
    FunctionName = aws_lambda_function.hits[0].function_name
  }
}

resource "aws_cloudwatch_log_metric_filter" "hits_put_failed" {
  count = var.enable_hitcounter ? 1 : 0

  name           = "${local.hits_name}-put-failed"
  log_group_name = aws_cloudwatch_log_group.hits[0].name
  pattern        = "{ $.msg = \"hits ddb update failed\" }"

  metric_transformation {
    name          = "${local.hits_name}-put-failed"
    namespace     = "MillsymillsCom/Hits"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "hits_put_failed" {
  count = var.enable_hitcounter ? 1 : 0

  alarm_name          = "${local.hits_name}-put-failed"
  alarm_description   = "hits Lambda failed to UpdateItem on the DynamoDB counter. Check CloudWatch Logs Insights for errName / errCode."
  namespace           = aws_cloudwatch_log_metric_filter.hits_put_failed[0].metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.hits_put_failed[0].metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.hits_ops[0].arn]
  ok_actions          = [aws_sns_topic.hits_ops[0].arn]
}
