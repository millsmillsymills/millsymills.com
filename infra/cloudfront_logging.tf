# CloudFront standard logs v2 delivered to S3 via the CloudWatch Logs
# delivery framework. Replaces the legacy `logging_config` block
# (which required ACLs and is incompatible with BucketOwnerEnforced).
#
# All three resources must live in us-east-1 since CloudFront is a
# us-east-1 service.

resource "aws_cloudwatch_log_delivery_source" "cloudfront_access" {
  count = var.enable_access_logging ? 1 : 0

  provider     = aws.us_east_1
  name         = "${replace(var.domain, ".", "-")}-cloudfront-access"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.site.arn
}

resource "aws_cloudwatch_log_delivery_destination" "cloudfront_access_s3" {
  count = var.enable_access_logging ? 1 : 0

  provider      = aws.us_east_1
  name          = "${replace(var.domain, ".", "-")}-cloudfront-access-s3"
  output_format = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = aws_s3_bucket.logs[0].arn
  }
}

resource "aws_cloudwatch_log_delivery" "cloudfront_access" {
  count = var.enable_access_logging ? 1 : 0

  provider                 = aws.us_east_1
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront_access[0].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3[0].arn

  s3_delivery_configuration {
    suffix_path                 = "cloudfront-access"
    enable_hive_compatible_path = true
  }

  # The bucket policy in s3.tf must exist before deliveries can land.
  depends_on = [aws_s3_bucket_policy.logs[0]]
}

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_cloudwatch_log_delivery_source.cloudfront_access
  to   = aws_cloudwatch_log_delivery_source.cloudfront_access[0]
}

moved {
  from = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3
  to   = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3[0]
}

moved {
  from = aws_cloudwatch_log_delivery.cloudfront_access
  to   = aws_cloudwatch_log_delivery.cloudfront_access[0]
}
