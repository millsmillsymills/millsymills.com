# Inspector TLS Lambda for the /inspector/ app.
#
# Architecture: a tiny Node.js Lambda exposed via Function URL. CloudFront
# adds an origin pointing at that URL, plus a cache behavior matching
# /api/tls/* that uses the custom origin-request policy
# `aws_cloudfront_origin_request_policy.inspector_tls` (defined in
# infra/cloudfront.tf). That policy whitelists only `CloudFront-Viewer-TLS`
# (the negotiated TLS protocol/cipher/SNI we surface) and `Origin` (used
# for the CORS allow-origin echo); Host is intentionally NOT forwarded so
# CloudFront rewrites it to the Lambda Function URL hostname. Lambda
# Function URLs reject any request whose Host header does not match
# `<id>.lambda-url.<region>.on.aws` with 403, so forwarding the viewer's
# Host (e.g. millsymills.com) — as the AWS-managed
# `Managed-AllViewerAndCloudFrontHeaders-2022-06` policy does — would
# 403 every CloudFront request and CloudFront would substitute /404.html
# via custom_error_response. See `aws_cloudfront_origin_request_policy.inspector_tls`
# in infra/cloudfront.tf for the matching commentary.
#
# The Lambda parses the forwarded TLS header and returns JSON; the
# inspector front-end fetches /api/tls/inspect and renders the result.
#
# The Lambda-behind-CloudFront-OAC scaffold (archive, role, basic-exec
# attachment, log group, function, Function URL, OAC, the Oct-2025 dual
# CloudFront permission pair, and the origin host) lives in
# `./modules/lambda_cloudfront_origin`; this file wires it up. inspector_tls
# carries no endpoint-specific storage or IAM — it only reads the forwarded
# TLS header — so the module block is the whole footprint.
#
# Why not Lambda@Edge? Edge functions can't be reasonably tested locally,
# can only run in us-east-1, and have a stricter deploy lifecycle. A
# regional Lambda + Function URL behind CloudFront gets us the same
# user→CloudFront TLS visibility with none of the edge-specific
# overhead. Pennies/year on traffic — same cost class as ct_monitor.

locals {
  inspector_tls_name = "${local.domain_slug}-inspector-tls"
}

module "inspector_tls_lambda" {
  source = "./modules/lambda_cloudfront_origin"

  name               = local.inspector_tls_name
  enabled            = var.enable_inspector_tls
  source_file        = "${path.module}/inspector_tls.mjs"
  handler            = "inspector_tls.handler"
  distribution_arn   = aws_cloudfront_distribution.site.arn
  log_retention_days = 14
}

# moved blocks: relocate the Lambda-origin resources from the flat
# `*.inspector_tls*` addresses into the shared module. Source addresses
# carry the `[0]` index from the original `count = var.enable_inspector_tls`
# gating; the module re-applies the same gate via `var.enabled`, so the
# index is preserved on both sides and no resource is destroyed/recreated.
# (data.archive_file is a data source -- no state, no move needed.)

moved {
  from = aws_iam_role.inspector_tls[0]
  to   = module.inspector_tls_lambda.aws_iam_role.this[0]
}

moved {
  from = aws_iam_role_policy_attachment.inspector_tls_basic[0]
  to   = module.inspector_tls_lambda.aws_iam_role_policy_attachment.basic[0]
}

moved {
  from = aws_cloudwatch_log_group.inspector_tls[0]
  to   = module.inspector_tls_lambda.aws_cloudwatch_log_group.this[0]
}

moved {
  from = aws_lambda_function.inspector_tls[0]
  to   = module.inspector_tls_lambda.aws_lambda_function.this[0]
}

moved {
  from = aws_lambda_function_url.inspector_tls[0]
  to   = module.inspector_tls_lambda.aws_lambda_function_url.this[0]
}

moved {
  from = aws_cloudfront_origin_access_control.inspector_tls[0]
  to   = module.inspector_tls_lambda.aws_cloudfront_origin_access_control.this[0]
}

moved {
  from = aws_lambda_permission.inspector_tls_cloudfront[0]
  to   = module.inspector_tls_lambda.aws_lambda_permission.cloudfront[0]
}

moved {
  from = aws_lambda_permission.inspector_tls_cloudfront_invoke[0]
  to   = module.inspector_tls_lambda.aws_lambda_permission.cloudfront_invoke[0]
}
