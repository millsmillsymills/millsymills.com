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
  canary_alert_email = var.canary_alert_address != "" ? var.canary_alert_address : "security@${var.domain}"
  canary_name        = "${local.domain_slug}-canary"
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
  force_destroy = true
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
