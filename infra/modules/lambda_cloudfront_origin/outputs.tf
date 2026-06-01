# Outputs are null when the module is disabled so callers can reference
# them unconditionally inside their own count/conditional expressions.

output "function_name" {
  value       = var.enabled ? aws_lambda_function.this[0].function_name : null
  description = "Lambda function name; feed to alarm dimensions and metric-filter log groups."
}

output "role_id" {
  value       = var.enabled ? aws_iam_role.this[0].id : null
  description = "Execution role id; attach endpoint-specific inline policies (DynamoDB, S3) to this."
}

output "role_name" {
  value = var.enabled ? aws_iam_role.this[0].name : null
}

output "role_arn" {
  value = var.enabled ? aws_iam_role.this[0].arn : null
}

output "oac_id" {
  value       = var.enabled ? aws_cloudfront_origin_access_control.this[0].id : null
  description = "Origin Access Control id; wire to the distribution origin's origin_access_control_id."
}

output "log_group_name" {
  value       = var.enabled ? aws_cloudwatch_log_group.this[0].name : null
  description = "Log group name; feed to aws_cloudwatch_log_metric_filter for failure alarms."
}

# Strip the `https://` scheme and trailing slash from the Function URL so
# CloudFront's `domain_name` (host only) accepts it. URL shape is
# `https://<id>.lambda-url.<region>.on.aws/`, stable across deploys for a
# given function name.
output "origin_host" {
  value       = var.enabled ? trimsuffix(replace(aws_lambda_function_url.this[0].function_url, "https://", ""), "/") : null
  description = "Function URL host (no scheme, no trailing slash); wire to the distribution origin's domain_name."
}

output "function_url" {
  value = var.enabled ? aws_lambda_function_url.this[0].function_url : null
}
