# CT log monitoring for ${var.domain}: a small Lambda polls crt.sh
# daily and fires an SNS alert on any cert issued for the domain by
# an issuer outside the allow-list. Pairs with `caa.tf`: CAA prevents
# most mis-issuance at the CA, this catches what slips through.
#
# Cost: pennies/year (free tier swallows it). Lambda invokes ~30/mo,
# SNS publishes ~0/mo in steady state, EventBridge schedules are free.
#
# After first apply: AWS sends an "AWS Notification — Subscription
# Confirmation" email to `local.ct_alert_email`. Click the confirm
# link or alerts go nowhere. Lambda code lives in `ct_monitor.py`.

locals {
  ct_alert_email = var.ct_monitor_alert_address != "" ? var.ct_monitor_alert_address : "security@${var.domain}"
  ct_name        = "${replace(var.domain, ".", "-")}-ct-monitor"
}

resource "aws_sns_topic" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  name = local.ct_name
}

resource "aws_sns_topic_subscription" "ct_monitor_email" {
  count = var.enable_ct_monitor ? 1 : 0

  topic_arn = aws_sns_topic.ct_monitor[0].arn
  protocol  = "email"
  endpoint  = local.ct_alert_email
}

data "archive_file" "ct_monitor" {
  type        = "zip"
  source_file = "${path.module}/ct_monitor.py"
  output_path = "${path.module}/.terraform/ct_monitor.zip"
}

resource "aws_iam_role" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  name = "${local.ct_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ct_monitor_basic" {
  count = var.enable_ct_monitor ? 1 : 0

  role       = aws_iam_role.ct_monitor[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ct_monitor_publish" {
  count = var.enable_ct_monitor ? 1 : 0

  name = "publish"
  role = aws_iam_role.ct_monitor[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sns:Publish"
      Resource = aws_sns_topic.ct_monitor[0].arn
    }]
  })
}

# Pre-create the log group so Terraform owns retention; otherwise
# Lambda creates it on first invoke with retention=Never (forever).
resource "aws_cloudwatch_log_group" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  name              = "/aws/lambda/${local.ct_name}"
  retention_in_days = 30
}

resource "aws_lambda_function" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  function_name    = local.ct_name
  role             = aws_iam_role.ct_monitor[0].arn
  filename         = data.archive_file.ct_monitor.output_path
  source_code_hash = data.archive_file.ct_monitor.output_base64sha256
  handler          = "ct_monitor.lambda_handler"
  runtime          = "python3.13"
  architectures    = ["arm64"]
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      DOMAIN                    = var.domain
      SNS_TOPIC_ARN             = aws_sns_topic.ct_monitor[0].arn
      ALLOWED_ISSUER_SUBSTRINGS = join(",", concat(["Amazon"], var.ct_monitor_extra_issuers))
      LOOKBACK_HOURS            = "48"
    }
  }

  depends_on = [aws_cloudwatch_log_group.ct_monitor[0]]
}

resource "aws_cloudwatch_event_rule" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  name                = local.ct_name
  description         = "Daily CT log monitor for ${var.domain}"
  schedule_expression = "cron(0 9 * * ? *)" # 09:00 UTC daily
}

resource "aws_cloudwatch_event_target" "ct_monitor" {
  count = var.enable_ct_monitor ? 1 : 0

  rule      = aws_cloudwatch_event_rule.ct_monitor[0].name
  target_id = "lambda"
  arn       = aws_lambda_function.ct_monitor[0].arn
}

resource "aws_lambda_permission" "ct_monitor_eventbridge" {
  count = var.enable_ct_monitor ? 1 : 0

  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ct_monitor[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ct_monitor[0].arn
}

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_sns_topic.ct_monitor
  to   = aws_sns_topic.ct_monitor[0]
}

moved {
  from = aws_sns_topic_subscription.ct_monitor_email
  to   = aws_sns_topic_subscription.ct_monitor_email[0]
}

moved {
  from = aws_iam_role.ct_monitor
  to   = aws_iam_role.ct_monitor[0]
}

moved {
  from = aws_iam_role_policy_attachment.ct_monitor_basic
  to   = aws_iam_role_policy_attachment.ct_monitor_basic[0]
}

moved {
  from = aws_iam_role_policy.ct_monitor_publish
  to   = aws_iam_role_policy.ct_monitor_publish[0]
}

moved {
  from = aws_cloudwatch_log_group.ct_monitor
  to   = aws_cloudwatch_log_group.ct_monitor[0]
}

moved {
  from = aws_lambda_function.ct_monitor
  to   = aws_lambda_function.ct_monitor[0]
}

moved {
  from = aws_cloudwatch_event_rule.ct_monitor
  to   = aws_cloudwatch_event_rule.ct_monitor[0]
}

moved {
  from = aws_cloudwatch_event_target.ct_monitor
  to   = aws_cloudwatch_event_target.ct_monitor[0]
}

moved {
  from = aws_lambda_permission.ct_monitor_eventbridge
  to   = aws_lambda_permission.ct_monitor_eventbridge[0]
}
