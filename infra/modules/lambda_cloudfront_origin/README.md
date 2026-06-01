# `lambda_cloudfront_origin`

Shared scaffold for a "tiny Node.js Lambda exposed via a Function URL,
locked to `AWS_IAM`, reachable only through a CloudFront Origin Access
Control" endpoint. Replaces the ~120-line copy-paste that was duplicated
across `inspector_tls.tf` and `hitcounter.tf` (`csp_report.tf` shares the
shape but needs a public POST URL — see Status below).

The module owns: `archive_file`, IAM role + basic-exec attachment,
CloudWatch log group, the Lambda function, the Function URL, the OAC, and
the **Oct-2025 dual CloudFront permission pair** (`InvokeFunctionUrl` +
`InvokeFunction` — see `project_oct2025_lambda_url_dual_permission`). The
caller keeps endpoint-specific resources (DynamoDB tables, S3 buckets,
extra inline IAM policy, alarms) and wires them to the module outputs.

## Outputs

`function_name`, `role_id`, `role_name`, `role_arn`, `oac_id`,
`log_group_name`, `origin_host` (host only, no scheme/trailing slash, for
the CloudFront origin `domain_name`), `function_url`. All are `null` when
`enabled = false`, so callers can reference them inside their own
`count`/conditional expressions.

## Status (2026-06-01)

Two GET endpoints use this module; the third (csp_report) was migrated in then
pulled back out because it needs a public, non-OAC URL.

- **`hitcounter.tf`** — uses the module. First-time feature deploy (hits was
  never previously applied), so its moved blocks were inert no-ops; `/api/hits`
  verified live.
- **`inspector_tls.tf`** — uses the module. Migrated in commit `fbf184a`; the
  plan showed every lambda-core resource (incl. `aws_lambda_function_url.this[0]`)
  as `has moved to module…`, `0 destroy`, only the lambda `filename` changing
  in-place (canonical `<name>.zip`, identical `source_code_hash`). Applied.
- **`csp_report.tf` — does NOT use the module.** It was migrated in `fbf184a`,
  but `/api/csp-report` takes browser **POSTs**, and OAC + Lambda Function URLs
  can't accept a browser-supplied POST body (the client would have to send an
  `x-amz-content-sha256` body hash; Lambda rejects unsigned payloads). So it was
  moved back out to a flat, public Function URL (`authorization_type = "NONE"`).
  This module is OAC-only (GET-shaped endpoints); a POST endpoint doesn't fit.
- **`webauthn_demo.tf` intentionally excluded** — its Function URL is not
  fronted by the shared OAC pattern and it carries two DynamoDB tables +
  an `npm ci` `null_resource`; forcing it through the module would add
  conditionals that erase the module's simplicity.

The module already encodes the **October 2025 dual-permission** requirement
(`InvokeFunctionUrl` + `InvokeFunction`); note that a public `NONE` URL needs
the *same pair* granted to principal `*` — csp_report adds both itself.

The move-safety gate that every migration here must pass: in the plan, **every**
lambda-core resource shows as `has moved`, never destroy+create. In particular
`…aws_lambda_function_url.this[0]` **must not be recreated** — a recreate
changes the `<id>.lambda-url…` hostname and breaks the CloudFront origin until
re-applied. An in-place `filename` update is acceptable (module zip-name change,
same `source_code_hash`); a destroy+create is not — STOP and fix the `moved`
mapping before applying.

## The transform (for any future OAC-fronted Lambda endpoint)

Same mechanical transform all three files demonstrate:

1. Replace the flat Lambda-core resources (`archive_file`, `aws_iam_role`,
   `aws_iam_role_policy_attachment.*_basic`, `aws_cloudwatch_log_group`,
   `aws_lambda_function`, `aws_lambda_function_url`,
   `aws_cloudfront_origin_access_control`, both `aws_lambda_permission`,
   and the `*_origin_host` local) with one `module "<name>_lambda"` block.
   - `inspector_tls` (in the module): `log_retention_days = 14`, no
     `environment`, omit `reserved_concurrent_executions` (defaults to `-1` =
     unreserved, matching today). No extra inline policy.
   - Endpoints with endpoint-specific resources keep them in the caller file
     wired to module outputs (`role_id`, `function_name`, `log_group_name`).
   - The module is for GET-shaped, OAC-fronted endpoints only. A POST endpoint
     (browser-submitted body) can't use OAC — see csp_report's flat, public
     (`NONE`) Function URL.
2. Re-point that file's alarms to `module.<name>_lambda.function_name` and
   `…log_group_name`.
3. Re-point `cloudfront.tf`'s origin block for that endpoint:
   `domain_name = module.<name>_lambda.origin_host` and
   `origin_access_control_id = module.<name>_lambda.oac_id`.
4. Delete that file's existing `[0]`-suffix `moved` blocks for the moved
   resources and add into-module `moved` blocks (old flat address → module
   address), exactly as `hitcounter.tf` shows. **Leave** the `moved` blocks
   for resources that stay in the file (S3 bucket config, alarms, SNS).
5. `terraform fmt -recursive`, then `plan` and apply the same
   no-destroy/recreate gate.
