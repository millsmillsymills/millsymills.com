# AWS access-key canarytoken (#141). An IAM user whose inline policy denies
# every action holds an access key that's planted in a public-looking spot.
# The key can do nothing, but ANY API call signed with it is recorded by a
# dedicated CloudTrail; a metric filter on the key id fires a CloudWatch alarm
# to an SNS email. Curiosity-driven probing turns into an actionable alert.
#
# Cost: management-events trails are free for the first copy per region and we
# enable no data events, so steady state is ~$0 (a near-empty trail bucket plus
# negligible CloudWatch Logs ingestion).
#
# DO NOT COMMIT THE SECRET ACCESS KEY. GitHub secret scanning would report it
# to AWS, which auto-applies AWSCompromisedKeyQuarantine and defeats the
# canary. The secret is a sensitive Terraform output; plant it out-of-band into
# the live site (an S3 object the repo never tracks). See
# docs/runbooks/canarytokens.md. Disabled by default — opt in per stack with
# enable_canary = true once the alert address is set and confirmed.

locals {
  canary_alert_email   = var.canary_alert_address != "" ? var.canary_alert_address : "security@${var.domain}"
  canary_name          = "${local.domain_slug}-canary"
  canary_slack_enabled = var.enable_canary && var.enable_canary_slack
}

# --- The bait: a do-nothing IAM user + access key --------------------------

resource "aws_iam_user" "canary" {
  count = var.enable_canary ? 1 : 0

  name = local.canary_name
  tags = { purpose = "canarytoken-do-not-use" }
}

resource "aws_iam_user_policy" "canary_deny_all" {
  count = var.enable_canary ? 1 : 0

  name = "deny-all"
  user = aws_iam_user.canary[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Deny"
      Action   = "*"
      Resource = "*"
    }]
  })
}

resource "aws_iam_access_key" "canary" {
  count = var.enable_canary ? 1 : 0

  user = aws_iam_user.canary[0].name
}

# --- Detection: a dedicated CloudTrail delivered to CloudWatch Logs ---------

resource "aws_s3_bucket" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket        = "${local.canary_name}-trail"
  force_destroy = false

  # Same posture as the access-logs bucket (s3.tf): force_destroy=false
  # alone would fail the bucket destroy on a non-empty bucket, but the
  # destroy plan still destroys the sibling resources (trail, policy,
  # versioning, PAB) before the bucket delete fails, leaving a dead
  # trail. prevent_destroy short-circuits the whole plan, so flipping
  # enable_canary true -> false requires removing this block AND
  # emptying the bucket (version-aware — versioning is on) before the
  # toggle flip takes; see the enable_canary description in
  # infra/variables.tf for the full recovery path. The point: a
  # one-line tfvars edit must not purge trail evidence. With versioning
  # on, force_destroy=true would have purged noncurrent versions too,
  # exactly the wrong default for an evidence bucket.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket                  = aws_s3_bucket.canary_trail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket = aws_s3_bucket.canary_trail[0].id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket = aws_s3_bucket.canary_trail[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

# Versioning protects the CloudTrail log objects from deletion or overwrite by
# a compromised IAM principal — the realistic forensic-tampering risk for an
# intrusion-detection bucket. Same low-risk-first posture as the access-logs
# bucket (s3.tf, #282), with one deliberate difference: no S3 lifecycle
# configuration (aws_s3_bucket_lifecycle_configuration). CloudTrail writes
# each log file under a unique key and never overwrites, so noncurrent
# versions only ever appear if something deletes or clobbers an object — they
# ARE the tamper evidence versioning exists to keep, and expiring them would
# defeat the point. Byte volume is tiny (management-events trail, no data
# events — event count is nontrivial but the gzipped files are not), so
# unbounded retention costs nothing.
resource "aws_s3_bucket_versioning" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket = aws_s3_bucket.canary_trail[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

# CloudTrail writes the log files; this is the AWS-documented minimum policy
# (GetBucketAcl on the bucket + PutObject under the account prefix with the
# bucket-owner-full-control ACL condition).
data "aws_iam_policy_document" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  statement {
    sid       = "AWSCloudTrailAclCheck"
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.canary_trail[0].arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.canary_name}"]
    }
  }

  statement {
    sid       = "AWSCloudTrailWrite"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.canary_trail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.canary_name}"]
    }
  }
}

resource "aws_s3_bucket_policy" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  bucket = aws_s3_bucket.canary_trail[0].id
  policy = data.aws_iam_policy_document.canary_trail[0].json
}

resource "aws_cloudwatch_log_group" "canary_trail" {
  count = var.enable_canary ? 1 : 0

  name              = "/aws/cloudtrail/${local.canary_name}"
  retention_in_days = 90
}

resource "aws_iam_role" "canary_trail_logs" {
  count = var.enable_canary ? 1 : 0

  name = "${local.canary_name}-trail-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "canary_trail_logs" {
  count = var.enable_canary ? 1 : 0

  name = "deliver-to-logs"
  role = aws_iam_role.canary_trail_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.canary_trail[0].arn}:*"
    }]
  })
}

# Multi-region management-events trail: the key could be exercised against a
# global service (sts/iam) or any regional endpoint, and we want all of them.
# No data events, so this stays in the free management-events tier.
resource "aws_cloudtrail" "canary" {
  count = var.enable_canary ? 1 : 0

  name                          = local.canary_name
  s3_bucket_name                = aws_s3_bucket.canary_trail[0].id
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.canary_trail[0].arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.canary_trail_logs[0].arn
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true

  depends_on = [aws_s3_bucket_policy.canary_trail]
}

# --- Alarm: any appearance of the canary key id in the trail ---------------

resource "aws_cloudwatch_log_metric_filter" "canary_used" {
  count = var.enable_canary ? 1 : 0

  name           = "${local.canary_name}-key-used"
  log_group_name = aws_cloudwatch_log_group.canary_trail[0].name
  # Matches whether the call was allowed or (here, always) AccessDenied —
  # CloudTrail records the accessKeyId on the denied attempt either way.
  pattern = "{ $.userIdentity.accessKeyId = \"${aws_iam_access_key.canary[0].id}\" }"

  metric_transformation {
    name          = "CanaryKeyUsed"
    namespace     = "MillsymillsCom/Canary"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_sns_topic" "canary" {
  count = var.enable_canary ? 1 : 0

  name = local.canary_name
}

resource "aws_sns_topic_subscription" "canary_email" {
  count = var.enable_canary ? 1 : 0

  topic_arn = aws_sns_topic.canary[0].arn
  protocol  = "email"
  endpoint  = local.canary_alert_email
}

resource "aws_cloudwatch_metric_alarm" "canary_used" {
  count = var.enable_canary ? 1 : 0

  alarm_name          = "${local.canary_name}-key-used"
  alarm_description   = "The ${local.canary_name} access key was used — it is bait and should never be exercised. Treat as an intrusion signal."
  namespace           = "MillsymillsCom/Canary"
  metric_name         = "CanaryKeyUsed"
  statistic           = "Sum"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.canary[0].arn]
}

# --- Robots-decoy tripwire: alert on any hit to the /admin/backup/ lure ------
#
# robots.txt Disallows /admin/backup/ -- a path that serves nothing and exists
# only as bait. The viewer-request CloudFront Function (cloudfront_function_index.js)
# console.logs a CANARY_TRIPWIRE sentinel on any request whose URI starts with
# /admin/backup. CloudFront Function logs always land in CloudWatch Logs in
# us-east-1 under /aws/cloudfront/function/<name>, so the metric filter, alarm,
# and its SNS topic all live in us-east-1 -- a CloudWatch alarm can only notify
# an SNS topic in its own region, which is why this can't reuse the primary-region
# aws_sns_topic.canary above. The function emits no log lines today, so Terraform
# owns the log group cleanly (no pre-existing auto-created group to import).

resource "aws_cloudwatch_log_group" "canary_cf_function" {
  count = var.enable_canary ? 1 : 0

  provider          = aws.us_east_1
  name              = "/aws/cloudfront/function/${local.domain_slug}-index-rewrite"
  retention_in_days = 90

  # The robots tripwire reads CANARY_TRIPWIRE lines emitted by the index-rewrite
  # CloudFront Function. If that function isn't deployed, nothing ever writes
  # here and the whole alarm chain sits silent -- the exact failure this tripwire
  # exists to prevent. Fail the plan loudly rather than ship a dead tripwire.
  lifecycle {
    precondition {
      condition     = var.enable_index_rewrite
      error_message = "enable_canary requires enable_index_rewrite: the robots tripwire alarms on logs from the index-rewrite CloudFront Function, which enable_index_rewrite gates."
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "canary_robots_tripwire" {
  count = var.enable_canary ? 1 : 0

  provider       = aws.us_east_1
  name           = "${local.canary_name}-robots-tripwire"
  log_group_name = aws_cloudwatch_log_group.canary_cf_function[0].name
  pattern        = "CANARY_TRIPWIRE"

  metric_transformation {
    name          = "RobotsTripwireHit"
    namespace     = "MillsymillsCom/Canary"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_sns_topic" "canary_robots" {
  count = var.enable_canary ? 1 : 0

  provider = aws.us_east_1
  name     = "${local.canary_name}-robots"
}

resource "aws_sns_topic_subscription" "canary_robots_email" {
  count = var.enable_canary ? 1 : 0

  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.canary_robots[0].arn
  protocol  = "email"
  endpoint  = local.canary_alert_email
}

resource "aws_cloudwatch_metric_alarm" "canary_robots_tripwire" {
  count = var.enable_canary ? 1 : 0

  provider            = aws.us_east_1
  alarm_name          = "${local.canary_name}-robots-tripwire"
  alarm_description   = "A request hit the /admin/backup/ decoy Disallowed in robots.txt -- the path is bait and serves nothing. Treat as recon/probing."
  namespace           = "MillsymillsCom/Canary"
  metric_name         = "RobotsTripwireHit"
  statistic           = "Sum"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.canary_robots[0].arn]
}

# --- Slack delivery: AWS Chatbot fans both topics into a Slack channel -------
#
# Optional second channel (var.enable_canary_slack) on top of the SNS email
# subscriptions, which stay put -- an intrusion alarm should not hinge on a
# single delivery path. One AWS Chatbot Slack channel configuration subscribes
# to SNS topics from multiple regions, so a single resource covers both the
# primary-region key-used topic and the us-east-1 robots topic.
#
# This config is created in the AWS Chatbot console first (the Slack-workspace
# OAuth and the channel role are console-only steps), then ADOPTED into
# Terraform with `terraform import` -- which is why configuration_name, the
# team/channel ids, and the channel role ARN come from variables matching the
# live config rather than being minted here. After import the only managed drift
# is sns_topic_arns: the console wires the robots topic, Terraform adds the
# key-used topic so the higher-severity alarm reaches Slack too. The channel
# role itself stays outside Terraform (adopted by ARN); the ReadOnlyAccess
# guardrail on the channel configuration is pinned in guardrail_policy_arns
# below. The role's trust policy is hardened out-of-band with an
# aws:ChatbotSourceArn condition (confused-deputy prevention -- see
# docs/runbooks/canarytokens.md).

resource "aws_chatbot_slack_channel_configuration" "canary" {
  count = local.canary_slack_enabled ? 1 : 0

  configuration_name    = var.canary_slack_config_name
  iam_role_arn          = var.canary_slack_iam_role_arn
  slack_team_id         = var.canary_slack_team_id
  slack_channel_id      = var.canary_slack_channel_id
  logging_level         = "ERROR"
  guardrail_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]

  sns_topic_arns = [
    aws_sns_topic.canary[0].arn,
    aws_sns_topic.canary_robots[0].arn,
  ]

  lifecycle {
    precondition {
      condition     = var.canary_slack_config_name != "" && var.canary_slack_team_id != "" && var.canary_slack_channel_id != "" && var.canary_slack_iam_role_arn != ""
      error_message = "enable_canary_slack requires canary_slack_config_name (committed stack tfvars) plus canary_slack_team_id, canary_slack_channel_id, and canary_slack_iam_role_arn (gitignored infra/stacks/<stack>.secrets.tfvars — a missing secrets file is the usual cause of this error). Create the config in the AWS Chatbot console, read those values from it, then `terraform import` per docs/runbooks/canarytokens.md."
    }
  }
}
