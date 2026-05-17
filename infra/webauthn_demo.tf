# WebAuthn / passkey demo backend (issue #140).
#
# Scaffold landed in PR #444 (Function URL + DynamoDB credential store +
# IAM role + stub handler). The real `@simplewebauthn/server`-backed
# registration + authentication handlers landed in PR for #446 (this
# file). Still outstanding: the `/demo/passkey` Astro page (#445) and
# the CloudFront-vs-direct-Function-URL decision (#447).
#
# Architecture differs from `infra/csp_report.tf` / `infra/inspector_tls.tf`
# in one place: the Function URL is `authorization_type = "NONE"` (public)
# rather than `AWS_IAM` behind a CloudFront OAC. That's a deliberate
# slice-level decision -- the followup CloudFront-slice PR will revisit
# it. The demo collects no PII; credentials are ephemeral (TTL'd) and
# origin-bound at the application layer.
#
# Cost guard: reserved_concurrent_executions = 5 mirrors csp_report --
# a runaway demo cannot blow the account budget.

locals {
  webauthn_demo_name       = "${replace(var.domain, ".", "-")}-webauthn-demo"
  webauthn_demo_lambda_dir = "${path.module}/lambdas/webauthn_demo"
  webauthn_sessions_table  = "${local.webauthn_demo_name}-sessions"
}

# --------------------------------------------------------------------
# DynamoDB credential store.
#
# `credentialId` (hash key) is the WebAuthn credential identifier;
# `expiresAt` is an epoch-seconds TTL attribute so DynamoDB purges
# stale demo registrations automatically (24h, set in the handler).
# Remaining attributes (publicKey/counter/userHandle/transports) are
# schemaless in DynamoDB -- the handler writes them without a
# migration.
# --------------------------------------------------------------------

resource "aws_dynamodb_table" "webauthn_credentials" {
  count = var.enable_webauthn_demo ? 1 : 0

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
# DynamoDB session store.
#
# In-flight ceremony state (challenge + userHandle + type) keyed on a
# random sessionId, with a 5-minute TTL set by the handler. Separating
# this from the credentials table keeps the credential row's lifecycle
# (24h TTL, persists across the registration/auth split) independent of
# the short-lived ceremony state. Item shape:
#
#   sessionId  (S, PK) -- random base64url, 16 bytes
#   challenge  (S)     -- challenge bytes echoed back by the client
#   userHandle (S)     -- synthetic, no PII
#   type       (S)     -- "registration" | "authentication"
#   expiresAt  (N)     -- epoch seconds, ~5 min from creation
# --------------------------------------------------------------------

resource "aws_dynamodb_table" "webauthn_sessions" {
  count = var.enable_webauthn_demo ? 1 : 0

  name         = local.webauthn_sessions_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}

# --------------------------------------------------------------------
# Lambda function + Function URL.
#
# The handler depends on `@simplewebauthn/server`; the AWS SDK is
# supplied by the Lambda Node.js runtime (matches the
# `infra/csp_report.mjs` pattern). The `null_resource` runs `npm ci
# --omit=dev` whenever `package-lock.json` changes, so the `node_modules`
# the archive_file zips is always reproducible from the committed lock.
# --------------------------------------------------------------------

resource "null_resource" "webauthn_demo_install" {
  count = var.enable_webauthn_demo ? 1 : 0

  triggers = {
    lockfile = filesha256("${local.webauthn_demo_lambda_dir}/package-lock.json")
  }

  provisioner "local-exec" {
    command     = "npm ci --omit=dev"
    working_dir = local.webauthn_demo_lambda_dir
  }
}

data "archive_file" "webauthn_demo" {
  type        = "zip"
  source_dir  = local.webauthn_demo_lambda_dir
  output_path = "${path.module}/.terraform/webauthn_demo.zip"

  # `tests/` is an unzipped dev-only payload -- exclude it to keep the
  # deployable bundle minimal and avoid shipping the test fixtures.
  excludes = [
    "tests",
    ".npmrc",
  ]

  depends_on = [null_resource.webauthn_demo_install]
}

resource "aws_iam_role" "webauthn_demo" {
  count = var.enable_webauthn_demo ? 1 : 0

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
  count = var.enable_webauthn_demo ? 1 : 0

  name              = "/aws/lambda/${local.webauthn_demo_name}"
  retention_in_days = 14
}

# Least-priv: the basic execution role grants logs:* on every log group
# in the account, which is broader than this Lambda needs. Inline the
# log-group-scoped CRUD instead, matching the resource-scoped pattern
# we use for DynamoDB below.
resource "aws_iam_role_policy" "webauthn_demo" {
  count = var.enable_webauthn_demo ? 1 : 0

  name = "webauthn-demo"
  role = aws_iam_role.webauthn_demo[0].id

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
          aws_cloudwatch_log_group.webauthn_demo[0].arn,
          "${aws_cloudwatch_log_group.webauthn_demo[0].arn}:*",
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
        Resource = [
          aws_dynamodb_table.webauthn_credentials[0].arn,
          aws_dynamodb_table.webauthn_sessions[0].arn,
        ]
      },
    ]
  })
}

resource "aws_lambda_function" "webauthn_demo" {
  count = var.enable_webauthn_demo ? 1 : 0

  function_name    = local.webauthn_demo_name
  role             = aws_iam_role.webauthn_demo[0].arn
  filename         = data.archive_file.webauthn_demo.output_path
  source_code_hash = data.archive_file.webauthn_demo.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 5
  # Bumped from 128 (PR #444 stub) to 256 -- @simplewebauthn/server pulls
  # in ASN.1 + COSE + CBOR + WebCrypto for attestation/assertion parsing,
  # which is heavier than the stub. 256 MB keeps the cold-start budget
  # comfortably inside the 5s timeout and stays inside the demo cost
  # envelope (PAY_PER_REQUEST DynamoDB + capped concurrency).
  memory_size = 256

  # Cap concurrent invocations so a runaway demo cannot blow the bill.
  # 5 leaves headroom for normal demo traffic; bursts beyond that get
  # throttled, which is the desired posture for a public no-auth
  # endpoint.
  reserved_concurrent_executions = 5

  environment {
    variables = {
      WEBAUTHN_TABLE           = aws_dynamodb_table.webauthn_credentials[0].name
      WEBAUTHN_SESSIONS_TABLE  = aws_dynamodb_table.webauthn_sessions[0].name
      WEBAUTHN_RP_ID           = var.domain
      WEBAUTHN_EXPECTED_ORIGIN = "https://${var.domain}"
    }
  }

  depends_on = [aws_cloudwatch_log_group.webauthn_demo[0]]
}

# Public Function URL. No CloudFront OAC fronting -- the
# direct-vs-CloudFront-origin decision is deferred to a followup PR
# (see header comment + issue #140). CORS allows only `https://<domain>`
# so a browser on any other origin cannot exercise the endpoint.
resource "aws_lambda_function_url" "webauthn_demo" {
  count = var.enable_webauthn_demo ? 1 : 0

  function_name      = aws_lambda_function.webauthn_demo[0].function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["https://${var.domain}"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type"]
    max_age       = 86400
  }
}

output "webauthn_demo_url" {
  description = "Public HTTPS endpoint for the WebAuthn demo Lambda. Routes /registration/options, /registration/verify, /authentication/options, /authentication/verify (all POST). Wire this into the `/demo/passkey` Astro page in the followup page-slice PR (#445). Null on stacks with `enable_webauthn_demo = false`; consumers must either guard for null or be downstream of a stack with the toggle on. `terraform output -raw webauthn_demo_url` errors loudly on null (`Unsupported value for raw output`), so a copy-paste workflow surfaces the absence; `terraform output -json` returns JSON null, so automated consumers must reject it explicitly."
  value       = var.enable_webauthn_demo ? aws_lambda_function_url.webauthn_demo[0].function_url : null
}

# --------------------------------------------------------------------
# Operational alarms.
#
# Mirrors the csp_report alarm shape (`infra/csp_report.tf`): a
# public, no-auth, internet-facing Lambda capped at
# reserved_concurrent_executions = 5 needs visibility on throttling,
# unhandled errors, and oversize-body abuse. Alarms publish to the
# shared `csp_report_ops` SNS topic so all Lambda-side ops alerts land
# on one channel; spinning up a webauthn-only topic is overkill while
# there's exactly one operator on the other end.
#
# Tuning intentionally diverges from csp_report (which uses
# period=300, evaluation_periods=2-3 to ride out spike noise during
# the CSP cutover): webauthn_demo is post-cutover, has no in-flight
# rollout that would generate transient spikes, and the demo
# endpoint is exercised live by a single user — every Throttle /
# Error / 413 is a real signal worth a same-period page. Tightening
# to period=60-300 / evaluation_periods=1 trades a slightly higher
# false-positive rate (still vanishingly low at this traffic volume)
# for faster MTTD on a public no-auth surface.
# --------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "webauthn_demo_throttles" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-throttles"
  alarm_description   = "webauthn_demo Lambda was throttled -- bursts beyond reserved_concurrent_executions are silently dropping passkey demo requests."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]

  dimensions = {
    FunctionName = aws_lambda_function.webauthn_demo[0].function_name
  }
}

# why: the handler maps every known failure mode (origin mismatch,
# unknown session, oversize body, etc.) to a 4xx JSON response without
# raising, so a Lambda Errors increment means an unexpected exception
# escaped the handler -- worth surfacing immediately on a public
# no-auth endpoint.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_errors" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-errors"
  alarm_description   = "webauthn_demo Lambda raised an uncaught exception. The handler maps known failures to 4xx JSON responses, so this signals an unexpected error path -- check CloudWatch Logs Insights."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]

  dimensions = {
    FunctionName = aws_lambda_function.webauthn_demo[0].function_name
  }
}

# Custom metric emitted by `infra/lambdas/webauthn_demo/index.mjs` via
# CloudWatch Embedded Metric Format: a single `console.warn` JSON blob
# with an `_aws` envelope tells CloudWatch to ingest the named metric
# for free, vs $0.30/M for PutMetricData. A handful of 413s a day is
# benign (fuzzers, broken clients); sustained volume on a public
# no-auth endpoint is a DoS signal. Threshold + windows match the
# csp_report body-cap alarm.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_body_too_large" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-body-too-large"
  alarm_description   = "webauthn_demo Lambda rejected oversize bodies (>4 KiB) at a sustained rate. Likely abuse or a misbehaving client; investigate request volume on the Function URL."
  namespace           = "MillsymillsCom/WebauthnDemo"
  metric_name         = "BodyTooLarge"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Custom metric emitted by `infra/lambdas/webauthn_demo/index.mjs` via
# EMF on the verify-handler `takeSession(...) === null` branch. A
# session miss = unknown sessionId, expired session, or replayed
# sessionId after the eager-delete in `takeSession`. Sustained volume
# on a public no-auth endpoint is the brute-force / session-guessing
# signal — Lambda's built-in Errors metric only counts uncaught
# exceptions, so handler-returned 400s aren't visible there. Threshold
# (50/5min) tolerates the realistic background rate (a few stale-tab
# retries, fuzzers) while surfacing sustained guessing volume.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_session_miss" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-session-miss"
  alarm_description   = "webauthn_demo verify handler rejected sessionId at a sustained rate. Unknown / expired / replayed sessions; likely brute-force or session-guessing — check request volume on the Function URL."
  namespace           = "MillsymillsCom/WebauthnDemo"
  metric_name         = "SessionMiss"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Custom metric emitted by `infra/lambdas/webauthn_demo/index.mjs` on
# the GENUINE-regression branch of updateCredentialCounter's catch only
# (TTL race + counter=0 deliberately don't emit so this alarm reflects
# real clone / replay signal, not noise). WebAuthn clone-detection is
# severe enough that the first occurrence should page — threshold 1 in
# 5min, no smoothing.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_counter_regression" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-counter-regression"
  alarm_description   = "webauthn_demo detected a signature counter regression. WebAuthn clone-detection signal: a second authenticator copy replayed an older signCount, or a captured assertion is being replayed. Investigate immediately on a public no-auth endpoint."
  namespace           = "MillsymillsCom/WebauthnDemo"
  metric_name         = "CounterRegression"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Catches "Lambda stopped being invoked at all" -- the failure mode the
# other three alarms can't see. They all use `treat_missing_data =
# "notBreaching"` and only fire on positive samples, so a broken
# Function URL / revoked IAM / accidental delete produces silence.
# `treat_missing_data = "breaching"` here flips the polarity: the alarm
# fires precisely when there's no data. 24h dry-spell tolerates the
# demo's bursty/zero-traffic baseline while still surfacing genuine
# outages within a day.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_invocations_zero" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-invocations-zero"
  alarm_description   = "webauthn_demo Lambda has had zero invocations for 24h. Likely a broken Function URL, revoked IAM role, or accidental delete -- not benign demo traffic gaps."
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 24
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]

  dimensions = {
    FunctionName = aws_lambda_function.webauthn_demo[0].function_name
  }
}

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_dynamodb_table.webauthn_credentials
  to   = aws_dynamodb_table.webauthn_credentials[0]
}

moved {
  from = aws_dynamodb_table.webauthn_sessions
  to   = aws_dynamodb_table.webauthn_sessions[0]
}

moved {
  from = null_resource.webauthn_demo_install
  to   = null_resource.webauthn_demo_install[0]
}

moved {
  from = aws_iam_role.webauthn_demo
  to   = aws_iam_role.webauthn_demo[0]
}

moved {
  from = aws_cloudwatch_log_group.webauthn_demo
  to   = aws_cloudwatch_log_group.webauthn_demo[0]
}

moved {
  from = aws_iam_role_policy.webauthn_demo
  to   = aws_iam_role_policy.webauthn_demo[0]
}

moved {
  from = aws_lambda_function.webauthn_demo
  to   = aws_lambda_function.webauthn_demo[0]
}

moved {
  from = aws_lambda_function_url.webauthn_demo
  to   = aws_lambda_function_url.webauthn_demo[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.webauthn_demo_throttles
  to   = aws_cloudwatch_metric_alarm.webauthn_demo_throttles[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.webauthn_demo_errors
  to   = aws_cloudwatch_metric_alarm.webauthn_demo_errors[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.webauthn_demo_body_too_large
  to   = aws_cloudwatch_metric_alarm.webauthn_demo_body_too_large[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.webauthn_demo_invocations_zero
  to   = aws_cloudwatch_metric_alarm.webauthn_demo_invocations_zero[0]
}
