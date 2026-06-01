# Hit-counter endpoint -- served at /api/hits, increments a single
# DynamoDB counter and returns JSON. Backs the web-1.0 hit-counter pixel
# in the taskbar chrome. Closes #468.
#
# The Lambda-behind-CloudFront-OAC scaffold (archive, role, basic-exec
# attachment, log group, function, Function URL, OAC, the Oct-2025 dual
# CloudFront permission pair, and the origin host) lives in
# `./modules/lambda_cloudfront_origin`; this file wires it up and adds the
# hits-specific DynamoDB table, IAM policy, and operational alarms. The
# CloudFront cache behavior `/api/hits` (in `infra/cloudfront.tf`)
# sigv4-signs every origin request, so the only path to the Lambda is
# through the distribution; direct calls to the raw Function URL return
# 403, preserving every CloudFront-applied security header.
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
  hits_name = "${local.domain_slug}-hits"
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
# Lambda function + Function URL (shared scaffold module).
# --------------------------------------------------------------------

module "hits_lambda" {
  source = "./modules/lambda_cloudfront_origin"

  name               = local.hits_name
  enabled            = var.enable_hitcounter
  source_file        = "${path.module}/hits.mjs"
  handler            = "hits.handler"
  distribution_arn   = aws_cloudfront_distribution.site.arn
  log_retention_days = 30

  # Bill cap. 10 leaves plenty of headroom for normal taskbar traffic
  # (one GET per page load); bursts beyond that get throttled, which
  # is the desired DoS posture.
  reserved_concurrent_executions = 10

  environment = var.enable_hitcounter ? { HITS_TABLE = one(aws_dynamodb_table.hits[*].name) } : {}
}

resource "aws_iam_role_policy" "hits_ddb" {
  count = var.enable_hitcounter ? 1 : 0

  name = "ddb-update"
  role = module.hits_lambda.role_id

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
    FunctionName = module.hits_lambda.function_name
  }
}

resource "aws_cloudwatch_log_metric_filter" "hits_put_failed" {
  count = var.enable_hitcounter ? 1 : 0

  name           = "${local.hits_name}-put-failed"
  log_group_name = module.hits_lambda.log_group_name
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

# moved blocks: relocate the Lambda-origin resources from the flat
# `*.hits` / `*.hits_*` addresses into the shared module. Source addresses
# carry the `[0]` index from the original `count = var.enable_hitcounter`
# gating; the module re-applies the same gate via `var.enabled`, so the
# index is preserved on both sides and no resource is destroyed/recreated.
# (data.archive_file is a data source -- no state, no move needed.)

moved {
  from = aws_iam_role.hits[0]
  to   = module.hits_lambda.aws_iam_role.this[0]
}

moved {
  from = aws_iam_role_policy_attachment.hits_basic[0]
  to   = module.hits_lambda.aws_iam_role_policy_attachment.basic[0]
}

moved {
  from = aws_cloudwatch_log_group.hits[0]
  to   = module.hits_lambda.aws_cloudwatch_log_group.this[0]
}

moved {
  from = aws_lambda_function.hits[0]
  to   = module.hits_lambda.aws_lambda_function.this[0]
}

moved {
  from = aws_lambda_function_url.hits[0]
  to   = module.hits_lambda.aws_lambda_function_url.this[0]
}

moved {
  from = aws_cloudfront_origin_access_control.hits[0]
  to   = module.hits_lambda.aws_cloudfront_origin_access_control.this[0]
}

moved {
  from = aws_lambda_permission.hits_cloudfront[0]
  to   = module.hits_lambda.aws_lambda_permission.cloudfront[0]
}

moved {
  from = aws_lambda_permission.hits_cloudfront_invoke[0]
  to   = module.hits_lambda.aws_lambda_permission.cloudfront_invoke[0]
}
