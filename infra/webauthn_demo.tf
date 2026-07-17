# WebAuthn / passkey demo backend (issue #140).
#
# Scaffold landed in PR #444 (Function URL + DynamoDB credential store +
# IAM role + stub handler). The real `@simplewebauthn/server`-backed
# registration + authentication handlers landed in PR for #446 (this
# file). Still outstanding: the `/demo/passkey` Astro page (#445) and
# the CloudFront-vs-direct-Function-URL decision (#447).
#
# Fronted by CloudFront at `/api/passkey/*` (decision #447, impl #630).
# Mirrors `infra/csp_report.tf`, NOT the inspector_tls/hits OAC pattern:
# every WebAuthn route is POST with a JSON body, and CloudFront OAC SigV4
# can't carry a browser-supplied POST body (Lambda rejects it 403 — see the
# csp_report.tf header). So the Function URL stays `authorization_type =
# "NONE"` and CloudFront injects a high-entropy `x-origin-secret` custom
# header; the handler rejects (403) anything lacking the match, closing the
# direct Function-URL bypass. The demo also collects no PII; credentials are
# ephemeral (TTL'd) and origin-bound at the application layer.
#
# Cost guard: reserved_concurrent_executions = 5 mirrors csp_report --
# a runaway demo cannot blow the account budget.

locals {
  webauthn_demo_name       = "${local.domain_slug}-webauthn-demo"
  webauthn_demo_lambda_dir = "${path.module}/lambdas/webauthn_demo"
  webauthn_sessions_table  = "${local.webauthn_demo_name}-sessions"
  webauthn_demo_origin_host = var.enable_webauthn_demo ? trimsuffix(
    replace(aws_lambda_function_url.webauthn_demo[0].function_url, "https://", ""),
    "/",
  ) : null
}

# High-entropy secret CloudFront injects as the x-origin-secret header so the
# public Function URL only honors CloudFront-proxied requests. Same pattern
# and rationale as random_password.csp_report_origin_secret.
resource "random_password" "webauthn_demo_origin_secret" {
  count = var.enable_webauthn_demo ? 1 : 0

  length  = 48
  special = false
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
      ORIGIN_SECRET            = random_password.webauthn_demo_origin_secret[0].result
    }
  }

  depends_on = [aws_cloudwatch_log_group.webauthn_demo[0]]
}

# Public Function URL (authorization_type = NONE) — see the header comment
# for why OAC isn't usable here (POST body + SigV4). No CORS block: browsers
# reach the endpoint same-origin through CloudFront at /api/passkey/*, and
# the x-origin-secret gate (not CORS) is what closes the direct-call bypass.
resource "aws_lambda_function_url" "webauthn_demo" {
  count = var.enable_webauthn_demo ? 1 : 0

  function_name      = aws_lambda_function.webauthn_demo[0].function_name
  authorization_type = "NONE"
}

# authorization_type = "NONE" only disables IAM auth; Lambda still denies
# invocation unless a resource-based policy grants it. Since AWS's October
# 2025 change a Function URL requires BOTH `lambda:InvokeFunctionUrl` (the
# URL surface) AND `lambda:InvokeFunction` (the underlying invoke) — granting
# only the first 403s with AccessDeniedException before CloudFront's request
# ever reaches the x-origin-secret gate. `invoked_via_function_url = true`
# scopes the principal "*" InvokeFunction grant to URL calls only. Mirrors
# the csp_report Function URL (see infra/csp_report.tf).
resource "aws_lambda_permission" "webauthn_demo_public" {
  count = var.enable_webauthn_demo ? 1 : 0

  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.webauthn_demo[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "webauthn_demo_public_invoke" {
  count = var.enable_webauthn_demo ? 1 : 0

  statement_id             = "FunctionURLAllowPublicInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.webauthn_demo[0].function_name
  principal                = "*"
  invoked_via_function_url = true
}

output "webauthn_demo_url" {
  description = "Raw Function URL of the WebAuthn demo Lambda. Internal origin only — CloudFront fronts it at https://<domain>/api/passkey/* and the browser never calls this directly. The raw URL is internet-reachable but returns 403 to any request lacking the CloudFront-injected x-origin-secret header. Null on stacks with `enable_webauthn_demo = false`; `terraform output -raw` errors loudly on null, `terraform output -json` returns JSON null."
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

# Custom metric emitted by `infra/lambdas/webauthn_demo/index.mjs` on the
# 403 origin-secret gate. Every legitimate request arrives via CloudFront
# carrying the injected x-origin-secret, so a mismatch means a caller found
# the raw *.lambda-url host and is hitting it directly. Sustained volume is
# the direct-call brute-force signal; Lambda's built-in Errors metric only
# counts uncaught exceptions, not handler-returned 403s. Same 50/5min
# tolerance as SessionMiss — a stray scanner won't page, sustained probing
# will.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_origin_secret_mismatch" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-origin-secret-mismatch"
  alarm_description   = "webauthn_demo rejected requests lacking CloudFront's x-origin-secret at a sustained rate. A caller is hitting the raw Function URL directly — check request volume on the *.lambda-url host."
  namespace           = "MillsymillsCom/WebauthnDemo"
  metric_name         = "OriginSecretMismatch"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.csp_report_ops[0].arn]
  ok_actions          = [aws_sns_topic.csp_report_ops[0].arn]
}

# Custom metric emitted by `infra/lambdas/webauthn_demo/index.mjs` when
# originMatches can't decode/parse a response's clientDataJSON. Attacker/bot
# garbage lands here benignly; the signal worth paging on is an internal
# base64url-decode regression that would silently reject every legitimate
# ceremony. Same 50/5min tolerance as OriginSecretMismatch — sporadic garbage
# won't page, a sustained spike (which a regression produces) will.
resource "aws_cloudwatch_metric_alarm" "webauthn_demo_origin_parse_failure" {
  count = var.enable_webauthn_demo ? 1 : 0

  alarm_name          = "${local.webauthn_demo_name}-origin-parse-failure"
  alarm_description   = "webauthn_demo failed to parse clientDataJSON origins at a sustained rate. Most likely an internal base64url-decode regression rejecting every legitimate ceremony (not attacker garbage, which the threshold tolerates). Check a recent deploy."
  namespace           = "MillsymillsCom/WebauthnDemo"
  metric_name         = "OriginParseFailure"
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
# fires precisely when there's no data.
#
# Organic demo traffic alone can't sustain this alarm -- the demo
# legitimately goes days with zero visitors, which made every quiet
# spell page as an outage. The hourly EventBridge synthetic ping below
# guarantees >= 1 invocation/hour through the full public path, so 24
# consecutive empty hours now means the path is actually broken, not
# that nobody visited.
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

# --------------------------------------------------------------------
# Hourly synthetic ping: EventBridge rule -> API destination -> POST
# https://<domain>/api/passkey/ping.
#
# Goes through CloudFront (not a direct lambda:Invoke) deliberately --
# the invocations-zero alarm exists to catch a broken CloudFront
# behavior / Function URL / revoked URL permission, and only a request
# down the real public path exercises those. The handler has no /ping
# route, so the ping gets the uniform 404 -- a handled response that
# increments Invocations without touching the error/mismatch metrics
# (CloudFront injects x-origin-secret, so the 403 gate passes; POST is
# never cached, and the behavior pins CachingDisabled anyway).
#
# Failure polarity is the point: if EventBridge, the API destination,
# CloudFront, or the Lambda breaks, pings stop counting and the alarm
# fires. There is no way for the ping mechanism to fail quietly green.
# --------------------------------------------------------------------

# API destinations require a connection with an auth block. The endpoint
# is public and needs no credentials, so the header below is an inert
# marker, not a secret -- it only tags the synthetic requests in logs.
resource "aws_cloudwatch_event_connection" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  name               = "${local.webauthn_demo_name}-ping"
  description        = "No-auth connection for the webauthn_demo liveness ping (header is an inert marker)"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-synthetic-ping"
      value = "webauthn-demo-liveness"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  name                             = "${local.webauthn_demo_name}-ping"
  description                      = "Synthetic liveness ping for ${var.domain} /api/passkey/*"
  invocation_endpoint              = "https://${var.domain}/api/passkey/ping"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.webauthn_demo_ping[0].arn
}

resource "aws_cloudwatch_event_rule" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  name                = "${local.webauthn_demo_name}-ping"
  description         = "Hourly synthetic invocation keeping the ${local.webauthn_demo_name}-invocations-zero alarm meaningful"
  schedule_expression = "rate(1 hour)"
}

resource "aws_iam_role" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  name = "${local.webauthn_demo_name}-ping"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  name = "invoke-api-destination"
  role = aws_iam_role.webauthn_demo_ping[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "events:InvokeApiDestination"
      Resource = aws_cloudwatch_event_api_destination.webauthn_demo_ping[0].arn
    }]
  })
}

resource "aws_cloudwatch_event_target" "webauthn_demo_ping" {
  count = var.enable_webauthn_demo ? 1 : 0

  rule     = aws_cloudwatch_event_rule.webauthn_demo_ping[0].name
  arn      = aws_cloudwatch_event_api_destination.webauthn_demo_ping[0].arn
  role_arn = aws_iam_role.webauthn_demo_ping[0].arn

  # The handler 404s before body parsing; ship an empty object instead of
  # the whole scheduled-event payload.
  input = jsonencode({})
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
