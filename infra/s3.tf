resource "aws_s3_bucket" "site" {
  bucket = var.domain
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Expire noncurrent versions so `aws s3 sync --delete` doesn't bloat the bucket.
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_logging" "site" {
  count = var.enable_access_logging ? 1 : 0

  bucket        = aws_s3_bucket.site.id
  target_bucket = aws_s3_bucket.logs[0].id
  target_prefix = "s3-access/"
}

# CloudFront Origin Access Control (OAC) — replaces legacy OAI
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = var.domain
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.site.arn
          }
        }
      },
      {
        # Defense-in-depth: refuse any non-TLS request even from
        # principals that would otherwise be allowed. CloudFront OAC
        # always uses HTTPS to S3, so this only affects future IAM
        # principals or misconfigured tooling.
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.site.arn,
          "${aws_s3_bucket.site.arn}/*",
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
# Access-log bucket for the site bucket.
# --------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket        = "${var.domain}-logs"
  force_destroy = false

  # Belt-and-braces with force_destroy=false: flipping
  # enable_access_logging true -> false on a non-empty bucket would fail
  # the destroy anyway (force_destroy=false), but the destroy plan still
  # destroys the sibling resources (PAB / SSE / versioning / policy)
  # before the bucket delete fails, leaving the survivor unguarded.
  # prevent_destroy short-circuits the whole plan
  # so the operator must explicitly remove this block first, then flip
  # the toggle — a deliberate two-step that prevents accidental
  # forensic-log loss via a one-line tfvars edit. See variable
  # description in infra/variables.tf for the full recovery path.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning protects access logs from deletion or overwrite by a
# compromised IAM principal — the realistic forensic-tampering risk
# for this bucket. Object Lock would be stronger but requires bucket
# replacement (only settable at creation time), which would force a
# disruptive re-create on the existing millsymills stack. Versioning
# is the low-risk first step per #282; revisit Object Lock if/when
# the bucket is replaced for another reason.
resource "aws_s3_bucket_versioning" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    # On a versioned bucket, `expiration { days = 90 }` does NOT delete
    # bytes — it inserts a delete marker (the prior current version is
    # demoted to noncurrent). Net forensic-recovery window is up to 180
    # days: 90 days as current, then up to 90 more as a recoverable
    # noncurrent version after the lifecycle-driven delete.
    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Sweep the zero-byte delete markers left behind once both the
  # current (90d) and noncurrent (additional 90d) versions are gone.
  # Without this rule they accumulate indefinitely as "expired object
  # delete markers" — small, but visible in inventory and noisy.
  # AWS forbids combining `expired_object_delete_marker` with
  # `expiration.days` in a single rule, so this lives separately.
  rule {
    id     = "sweep-orphan-delete-markers"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Grant PutObject to:
#   - the S3 server access logging service (for the site bucket's own logs)
#   - the CloudWatch Logs delivery service (for CloudFront standard logs v2)
resource "aws_s3_bucket_policy" "logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3ServerAccessLogging"
        Effect = "Allow"
        Principal = {
          Service = "logging.s3.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.logs[0].arn}/s3-access/*"
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.site.arn
          }
        }
      },
      {
        Sid    = "AllowCloudFrontStandardLogsV2Delivery"
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action = "s3:PutObject"
        # Per AWS v2-delivery docs, when the destination bucket has no prefix
        # CloudFront auto-prepends `AWSLogs/{account-id}/CloudFront/` to the
        # suffix path (`cloudfront-access` here); with `enable_hive_compatible_path
        # = true` the account-id segment is rendered as
        # `aws-account-id={account-id}` so partition discovery works in
        # Athena / DuckDB. The full rendered prefix is therefore
        # `AWSLogs/aws-account-id={account-id}/CloudFront/cloudfront-access/`.
        # The earlier resource value `cloudfront-access/*` was the *suffix*
        # we asked for, NOT the path AWS actually writes to — PUTs were
        # silently denied since the cutover. Refs slice-1 smoke discovery.
        # https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html § "Example paths to access logs"
        Resource = "${aws_s3_bucket.logs[0].arn}/AWSLogs/aws-account-id=${data.aws_caller_identity.current.account_id}/CloudFront/cloudfront-access/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:logs:us-east-1:${data.aws_caller_identity.current.account_id}:delivery-source:*"
          }
        }
      },
      {
        # Defense-in-depth: refuse non-TLS access to access logs.
        # The S3-access-logging and CloudFront-logs-delivery services
        # both use TLS, so this only affects future IAM principals
        # or read tooling that might otherwise reach these logs.
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.logs[0].arn,
          "${aws_s3_bucket.logs[0].arn}/*",
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

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_s3_bucket_logging.site
  to   = aws_s3_bucket_logging.site[0]
}

moved {
  from = aws_s3_bucket.logs
  to   = aws_s3_bucket.logs[0]
}

moved {
  from = aws_s3_bucket_public_access_block.logs
  to   = aws_s3_bucket_public_access_block.logs[0]
}

moved {
  from = aws_s3_bucket_ownership_controls.logs
  to   = aws_s3_bucket_ownership_controls.logs[0]
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.logs
  to   = aws_s3_bucket_server_side_encryption_configuration.logs[0]
}

moved {
  from = aws_s3_bucket_versioning.logs
  to   = aws_s3_bucket_versioning.logs[0]
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.logs
  to   = aws_s3_bucket_lifecycle_configuration.logs[0]
}

moved {
  from = aws_s3_bucket_policy.logs
  to   = aws_s3_bucket_policy.logs[0]
}
