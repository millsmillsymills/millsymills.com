# CSP report endpoint — accepts violation reports posted by browsers at
# /api/csp-report and persists them to S3 with a 30-day lifecycle.
#
# A tiny Node.js Lambda behind a Function URL, fronted by CloudFront at
# /api/csp-report. Unlike the inspector_tls and hits endpoints, this one
# does NOT use the shared lambda_cloudfront_origin (OAC) module: CloudFront
# Origin Access Control signs origin requests with SigV4, and a Lambda
# Function URL rejects any PUT/POST whose body isn't covered by an
# `x-amz-content-sha256` header the *client* must supply (Lambda doesn't
# accept unsigned payloads — see the "Important" note at
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html).
# Browsers can't add that header, so every CSP report POST through OAC got
# a 403 at the Function URL (mapped to /404.html by custom_error_response)
# and never reached the handler. CSP reports are always POST, so OAC is a
# dead end here.
#
# Instead the Function URL is `authorization_type = "NONE"` (public) and
# CloudFront forwards to it as a plain custom origin. The raw Function URL
# is internet-reachable, but this is a write-only sink: it returns 204 with
# no body, validates Content-Type (415), caps the body (413) and JSON shape
# (400), and is concurrency-capped (reserved_concurrent_executions = 5), so
# a public surface carries no data-exposure risk and a bounded cost risk.
# The CloudFront origin-request policy still strips Host so the Function URL
# accepts the rewritten Host.
#
# Browser report formats accepted (see `infra/csp_report.mjs`):
#   * `application/reports+json` — Reporting API (`Reporting-Endpoints` +
#     `report-to csp` in CSP).
#   * `application/csp-report` — legacy `report-uri` directive payload.
#   * `application/json` — older Firefox quirk for `report-uri`.
#
# Reports older than 30 days are deleted by the bucket's lifecycle rule —
# well above the 30-day floor in #131 and short enough that the bucket
# never grows unboundedly.

locals {
  csp_report_name        = "${local.domain_slug}-csp-report"
  csp_report_bucket_name = "${var.domain}-csp-reports"
}

# --------------------------------------------------------------------
# S3 bucket for persisted reports.
# --------------------------------------------------------------------

resource "aws_s3_bucket" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  bucket = local.csp_report_bucket_name
}

resource "aws_s3_bucket_public_access_block" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  bucket = aws_s3_bucket.csp_report[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  bucket = aws_s3_bucket.csp_report[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  bucket = aws_s3_bucket.csp_report[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  bucket = aws_s3_bucket.csp_report[0].id

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
  count = var.enable_csp_report ? 1 : 0

  bucket = aws_s3_bucket.csp_report[0].id

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
          aws_s3_bucket.csp_report[0].arn,
          "${aws_s3_bucket.csp_report[0].arn}/*",
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
# Lambda function + Function URL (public; see header for why not OAC).
# --------------------------------------------------------------------

data "archive_file" "csp_report" {
  type        = "zip"
  source_file = "${path.module}/csp_report.mjs"
  output_path = "${path.module}/.terraform/csp_report.zip"
}

resource "aws_iam_role" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

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
  count = var.enable_csp_report ? 1 : 0

  role       = aws_iam_role.csp_report[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "csp_report_put" {
  count = var.enable_csp_report ? 1 : 0

  name = "put-reports"
  role = aws_iam_role.csp_report[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:PutObject"
      Resource = "${aws_s3_bucket.csp_report[0].arn}/reports/*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  name              = "/aws/lambda/${local.csp_report_name}"
  retention_in_days = 30
}

resource "aws_lambda_function" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  function_name    = local.csp_report_name
  role             = aws_iam_role.csp_report[0].arn
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
      REPORT_BUCKET = aws_s3_bucket.csp_report[0].id
    }
  }

  depends_on = [aws_cloudwatch_log_group.csp_report[0]]
}

# Public Function URL. authorization_type = "NONE" because the only
# callers are browsers POSTing CSP reports, and OAC's SigV4 signing can't
# carry a browser-supplied request body (see file header). Reached via
# CloudFront at /api/csp-report; the raw URL is public but write-only.
resource "aws_lambda_function_url" "csp_report" {
  count = var.enable_csp_report ? 1 : 0

  function_name      = aws_lambda_function.csp_report[0].function_name
  authorization_type = "NONE"
}

# authorization_type = "NONE" only disables IAM auth; Lambda still denies
# invocation unless a resource-based policy grants it. The console/SAM add
# this automatically when you flip a URL to NONE; via Terraform you add it
# yourself. Since AWS's October 2025 change a function URL requires BOTH
# `lambda:InvokeFunctionUrl` (the URL surface) AND `lambda:InvokeFunction`
# (the underlying invoke) — granting only the first 403s with
# AccessDeniedException. `invoked_via_function_url = true` scopes the
# principal "*" InvokeFunction grant to URL calls only, so a public caller
# can't invoke the function through any other path.
resource "aws_lambda_permission" "csp_report_public" {
  count = var.enable_csp_report ? 1 : 0

  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.csp_report[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "csp_report_public_invoke" {
  count = var.enable_csp_report ? 1 : 0

  statement_id             = "FunctionURLAllowPublicInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.csp_report[0].function_name
  principal                = "*"
  invoked_via_function_url = true
}

locals {
  csp_report_origin_host = var.enable_csp_report ? trimsuffix(
    replace(aws_lambda_function_url.csp_report[0].function_url, "https://", ""),
    "/",
  ) : null
}

# --------------------------------------------------------------------
# Operational alarms.
#
# Two failure modes worth alerting on:
#
#   1. Throttling. `reserved_concurrent_executions = 5` is a deliberate
#      cost guard, but during a Report-Only -> enforce CSP flip the
#      browser fleet can burst well past 5 concurrent invocations and
#      reports get silently dropped exactly when they're most needed
#      (legitimate violations from real users). The Throttles metric
#      surfaces that pressure.
#
#   2. S3 PutObject failures. `infra/csp_report.mjs` already emits a
#      structured JSON log line (`msg = "csp-report s3 put failed"`)
#      with errName/errCode fields when the put fails. A metric filter
#      converts the log line into a CloudWatch metric so we can alarm
#      on it.
#
# Both alarms publish to a dedicated SNS topic so a future alert volume
# spike (e.g. AWS-side S3 incident) can be muted without touching the
# CT-monitor pager.
# --------------------------------------------------------------------

resource "aws_sns_topic" "csp_report_ops" {
  count = var.enable_csp_report ? 1 : 0

  name = "${local.csp_report_name}-ops"
}

resource "aws_sns_topic_subscription" "csp_report_ops_email" {
  count = var.enable_csp_report ? 1 : 0

  topic_arn = aws_sns_topic.csp_report_ops[0].arn
  protocol  = "email"
  endpoint  = local.ct_alert_email
}

# why: require a sustained problem (two consecutive 5-min windows) rather
# than a single transient throttle. The Report-Only -> enforce CSP flip
# is expected to burst past reserved_concurrent_executions briefly, and
# a single 5-min spike during cutover is not actionable on its own.
resource "aws_cloudwatch_metric_alarm" "csp_report_throttles" {
  count = var.enable_csp_report ? 1 : 0

  alarm_name          = "${local.csp_report_name}-throttles"
  alarm_description   = "csp_report Lambda was throttled -- bursts beyond reserved_concurrent_executions are silently dropping CSP reports."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]

  dimensions = {
    FunctionName = aws_lambda_function.csp_report[0].function_name
  }
}

# Metric filter on the structured log line emitted by csp_report.mjs
# when the PutObjectCommand fails. JSON pattern matches the `msg`
# field exactly so unrelated structured logs (or future log lines)
# don't trip the alarm.
resource "aws_cloudwatch_log_metric_filter" "csp_report_put_failed" {
  count = var.enable_csp_report ? 1 : 0

  name           = "${local.csp_report_name}-put-failed"
  log_group_name = aws_cloudwatch_log_group.csp_report[0].name
  pattern        = "{ $.msg = \"csp-report s3 put failed\" }"

  metric_transformation {
    name          = "${local.csp_report_name}-put-failed"
    namespace     = "MillsymillsCom/CspReport"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# why: require a sustained problem (two consecutive 5-min windows) rather
# than a single transient PutObject failure. S3 has intermittent 5xx
# noise that resolves on retry; only repeated failures across windows
# indicate a real IAM/throttle/outage condition worth paging on.
resource "aws_cloudwatch_metric_alarm" "csp_report_put_failed" {
  count = var.enable_csp_report ? 1 : 0

  alarm_name          = "${local.csp_report_name}-put-failed"
  alarm_description   = "csp_report Lambda failed to PutObject to the reports bucket. Check CloudWatch Logs Insights for errName / errCode -- structured fields preserved by the JSON log line."
  namespace           = aws_cloudwatch_log_metric_filter.csp_report_put_failed[0].metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.csp_report_put_failed[0].metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Metric filter + alarm on body-cap rejections (413). `csp_report.mjs`
# emits a structured warn log line when a payload exceeds MAX_BODY_BYTES.
# A handful of 413s a day is benign (a misconfigured browser, a fuzzer);
# sustained volume is a DoS signal worth investigating. Tuned high
# (3 windows, >=5 events per window) so it doesn't page on noise.
resource "aws_cloudwatch_log_metric_filter" "csp_report_body_cap_exceeded" {
  count = var.enable_csp_report ? 1 : 0

  name           = "${local.csp_report_name}-body-cap-exceeded"
  log_group_name = aws_cloudwatch_log_group.csp_report[0].name
  pattern        = "{ $.msg = \"csp-report body cap exceeded\" }"

  metric_transformation {
    name          = "${local.csp_report_name}-body-cap-exceeded"
    namespace     = "MillsymillsCom/CspReport"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "csp_report_body_cap_exceeded" {
  count = var.enable_csp_report ? 1 : 0

  alarm_name          = "${local.csp_report_name}-body-cap-exceeded"
  alarm_description   = "csp_report Lambda rejected oversize payloads (>16 KiB) at a sustained rate. Likely abuse or a misbehaving client; investigate CloudFront access logs for the originating viewer."
  namespace           = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded[0].metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded[0].metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Metric filter + alarm on malformed-report rejections. `csp_report.mjs`
# emits `{ msg = "csp-report rejected", reason = "malformed-report" }` when
# a payload passes the content-type + JSON-parse gates but fails the
# top-level shape check. A trickle is benign (bots, fuzzers); a sustained
# spike means a browser's report format drifted and legitimate violation
# reports are being dropped before the S3 write -- a silent failure that no
# other alarm catches. The pattern matches `reason` too, so the noisier
# unsupported-content-type / invalid-json rejections (same `msg`) stay out
# of the metric and remain queryable in Logs Insights without paging.
resource "aws_cloudwatch_log_metric_filter" "csp_report_malformed" {
  count = var.enable_csp_report ? 1 : 0

  name           = "${local.csp_report_name}-malformed"
  log_group_name = aws_cloudwatch_log_group.csp_report[0].name
  pattern        = "{ $.msg = \"csp-report rejected\" && $.reason = \"malformed-report\" }"

  metric_transformation {
    name          = "${local.csp_report_name}-malformed"
    namespace     = "MillsymillsCom/CspReport"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# why: tuned identically to the body-cap alarm (3 windows, >=5 events per
# window) so transient client noise doesn't page, but a real format drift
# -- which would dump a steady stream of malformed reports -- does.
resource "aws_cloudwatch_metric_alarm" "csp_report_malformed" {
  count = var.enable_csp_report ? 1 : 0

  alarm_name          = "${local.csp_report_name}-malformed"
  alarm_description   = "csp_report Lambda rejected well-formed-shape-failing reports at a sustained rate. Likely a browser report-format drift dropping real CSP violations before the S3 write -- inspect recent rejected log lines in CloudWatch Logs Insights."
  namespace           = aws_cloudwatch_log_metric_filter.csp_report_malformed[0].metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.csp_report_malformed[0].metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# moved blocks.
#
# Resources that STAY flat keep their original unindexed -> [0] moves
# (from the earlier count = ... gating); those are state no-ops now.
#
# The lambda-core resources were briefly migrated into the shared
# lambda_cloudfront_origin module (commit c58c149) and are moved back out
# here, because csp_report needs a public (non-OAC) Function URL. Their
# current state addresses are `module.csp_lambda.*`; map them back to the
# flat addresses. The module's OAC + the two AWS_IAM lambda permissions
# have no destination and are destroyed — intended, the public URL needs
# neither.

moved {
  from = aws_s3_bucket.csp_report
  to   = aws_s3_bucket.csp_report[0]
}

moved {
  from = aws_s3_bucket_public_access_block.csp_report
  to   = aws_s3_bucket_public_access_block.csp_report[0]
}

moved {
  from = aws_s3_bucket_ownership_controls.csp_report
  to   = aws_s3_bucket_ownership_controls.csp_report[0]
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.csp_report
  to   = aws_s3_bucket_server_side_encryption_configuration.csp_report[0]
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.csp_report
  to   = aws_s3_bucket_lifecycle_configuration.csp_report[0]
}

moved {
  from = aws_s3_bucket_policy.csp_report
  to   = aws_s3_bucket_policy.csp_report[0]
}

moved {
  from = aws_iam_role_policy.csp_report_put
  to   = aws_iam_role_policy.csp_report_put[0]
}

moved {
  from = aws_sns_topic.csp_report_ops
  to   = aws_sns_topic.csp_report_ops[0]
}

moved {
  from = aws_sns_topic_subscription.csp_report_ops_email
  to   = aws_sns_topic_subscription.csp_report_ops_email[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.csp_report_throttles
  to   = aws_cloudwatch_metric_alarm.csp_report_throttles[0]
}

moved {
  from = aws_cloudwatch_log_metric_filter.csp_report_put_failed
  to   = aws_cloudwatch_log_metric_filter.csp_report_put_failed[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.csp_report_put_failed
  to   = aws_cloudwatch_metric_alarm.csp_report_put_failed[0]
}

moved {
  from = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded
  to   = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded
  to   = aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded[0]
}

# Lambda-core resources moving back out of module.csp_lambda to flat.

moved {
  from = module.csp_lambda.aws_iam_role.this[0]
  to   = aws_iam_role.csp_report[0]
}

moved {
  from = module.csp_lambda.aws_iam_role_policy_attachment.basic[0]
  to   = aws_iam_role_policy_attachment.csp_report_basic[0]
}

moved {
  from = module.csp_lambda.aws_cloudwatch_log_group.this[0]
  to   = aws_cloudwatch_log_group.csp_report[0]
}

moved {
  from = module.csp_lambda.aws_lambda_function.this[0]
  to   = aws_lambda_function.csp_report[0]
}

moved {
  from = module.csp_lambda.aws_lambda_function_url.this[0]
  to   = aws_lambda_function_url.csp_report[0]
}
