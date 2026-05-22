---
title: CloudFront OAC → Lambda Function URL needs BOTH `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` after Oct 2025
date: 2026-05-21
category: infrastructure
module: lambda-function-url
problem_type: aws_behavior_change
component: terraform
severity: high
applies_when:
  - Wiring an additional Lambda Function URL behind a CloudFront OAC
  - Debugging a 403 from a Function URL origin where Lambda is never invoked
  - Auditing existing OAC → Function URL chains in this repo
related_prs: []
related_issues:
  - "#571"
  - "#551"
affected_files:
  - infra/csp_report.tf
  - infra/hitcounter.tf
  - infra/inspector_tls.tf
  - infra/stacks/millsymills.tfvars
tags:
  - aws
  - cloudfront
  - lambda
  - oac
  - function-url
  - terraform
  - authorization
---

# CloudFront OAC → Lambda Function URL needs BOTH `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` after Oct 2025

## Symptom

All Lambda Function URL origins behind CloudFront OAC on distribution `E2C02W539ZK8NS` returned 403 from origin, which `custom_error_response` rewrote to 404. The Lambda was never invoked — zero invocations on `csp_report` and `inspector_tls` over the prior 7 days. Direct SigV4-signed calls to the same Function URLs returned 200 (or the handler's intentional 405/403), so Lambda code and the Function URL itself were healthy.

Raw 403 body (with `custom_error_response` temporarily disabled):

```
HTTP/2 403
Content-Length: 144
{"Message":"Forbidden. For troubleshooting Function URL authorization issues, see: https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html"}
```

Three independent OACs (`E1RUPJ5JE8A4W8`, `E3KEL724JRU9I1`, `E1LFFVV7G8L7MG`) all failed identically. PR #550 (the hit counter) surfaced the bug because its taskbar widget is the first endpoint with active client traffic; `csp_report` and `inspector_tls` were silently broken because nothing was calling them.

## Cause

**Starting October 2025, AWS Lambda Function URL authorization requires two permissions, not one:**

- `lambda:InvokeFunctionUrl` — authorizes the URL surface (this is what every pre-Oct-2025 guide and example shows).
- `lambda:InvokeFunction` with `invoked_via_function_url = true` — authorizes the underlying invocation.

CloudFront OAC signs the request correctly with SigV4, AWS Lambda accepts the signature, then Lambda's authorizer rejects with 403 because the second permission is missing. The 144-byte "Forbidden. For troubleshooting Function URL authorization issues…" body is the tell — it means the request reached Lambda's authorizer (so signing is fine) but was denied before the handler ran.

The Terraform in this repo predated the change and only granted `lambda:InvokeFunctionUrl`. Three resources were affected:

- `aws_lambda_permission.csp_report_cloudfront` (csp_report.tf)
- `aws_lambda_permission.hits_cloudfront` (hitcounter.tf)
- `aws_lambda_permission.inspector_tls_cloudfront` (inspector_tls.tf)

## Fix

For each Function URL origin, add a sibling `aws_lambda_permission` resource granting `lambda:InvokeFunction` via the function URL:

```hcl
resource "aws_lambda_permission" "hits_cloudfront_invoke" {
  count = var.enable_hitcounter ? 1 : 0

  statement_id             = "AllowCloudFrontServicePrincipalInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.hits[0].function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.site.arn
  invoked_via_function_url = true

  depends_on = [aws_cloudfront_distribution.site]
}
```

Note the Terraform-specific `invoked_via_function_url = true` argument — this is what tells the AWS API to add the `lambda:FunctionUrlAuthType = AWS_IAM` condition that scopes the permission to invocations arriving via the Function URL rather than direct invoke. Keep the existing `*_cloudfront` permission (with `action = "lambda:InvokeFunctionUrl"` and `function_url_auth_type = "AWS_IAM"`) as well — both are required.

The same pattern was applied to `csp_report` and `inspector_tls`.

## Why This Matters

This is a quiet, dated behavior change in AWS — the kind that's easy to miss because:

- Every existing tutorial, blog post, and pre-Oct-2025 example shows only the single `lambda:InvokeFunctionUrl` permission. Copy-pasting "best practice" from before that date is now wrong.
- The 403 looks like a signing failure, not an authorization gap. Hours can vanish debugging OAC, signing protocol, Function URL auth type, origin request policy, header allowlists, and service-linked roles before noticing the AWS docs sentence: *"Starting in October 2025, newly-created function URLs will require both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` permissions."*
- Function URLs created before October 2025 may still work with only one permission, so a repo that mixes old and recently-created URLs will have some endpoints inexplicably broken and others fine.
- Three independent OAC failures on one distribution look like a distribution- or account-level AWS bug. The instinct is "open an AWS support ticket," not "audit each Lambda resource policy." The path-of-least-resistance debug doesn't land on the actual cause.

The diagnosis path that worked: noticing the AWS Lambda Function URL auth docs had updated language, then comparing against current `aws lambda get-policy` output for each function. The current `add-permission` example in the CloudFront OAC docs page now shows both permissions side by side.

## When to Apply

- Any additional Lambda Function URL added to this repo or anywhere downstream of CloudFront OAC.
- Any 403 from a Function URL origin behind CloudFront where the Lambda has zero invocations in CloudWatch (i.e. the request never reaches the handler).
- Any audit of pre-October-2025 Terraform that wires CloudFront OAC to Lambda Function URLs.

## Verification

After applying, confirm with `aws lambda get-policy --function-name <name>`. The Statement array should contain two entries per CloudFront principal: one with `Action: lambda:InvokeFunctionUrl`, one with `Action: lambda:InvokeFunction`. Both should have the same `Condition` block scoping to `AWS:SourceArn` of the distribution and `lambda:FunctionUrlAuthType = AWS_IAM`.

Live check: a GET to the endpoint through CloudFront should now return the handler's own status code (e.g. `/api/csp-report` returns 405 for GET because the handler only accepts POST; `/api/tls/v1` returns 403 because the handler intentionally rejects requests missing `cloudfront-viewer-tls`). Both indicate the handler ran — that's the signal that authorization passed.

## Related

- Issue #571 — original report and diagnosis trail
- Issue #551 — `/api/hits` activation (blocked on this fix landing on prod)
- PR #550 — hit counter feature that surfaced the latent bug
- AWS docs: [Lambda Function URL security and auth model](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html) — the "Starting in October 2025…" note
- AWS docs: [Use CloudFront origin access control with Lambda Function URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html) — current example shows both `add-permission` calls
