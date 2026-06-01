# `lambda_cloudfront_origin`

Shared scaffold for a "tiny Node.js Lambda exposed via a Function URL,
locked to `AWS_IAM`, reachable only through a CloudFront Origin Access
Control" endpoint. Replaces the ~120-line copy-paste that was duplicated
across `inspector_tls.tf`, `csp_report.tf`, and `hitcounter.tf` (#1 in the
2026-06-01 thermo-nuclear audit).

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

- **`hitcounter.tf` migrated** — the tracer-bullet. `terraform validate`
  passes (HCL + wiring + no dependency cycle). **Not yet `plan`/`apply`'d
  against live state** — done offline with a local-backend override
  because the S3 backend's STS probe fails without AWS auth.
- **`inspector_tls.tf` and `csp_report.tf` NOT yet migrated** — replicate
  per the checklist below once the hitcounter `plan` confirms clean moves.
- **`webauthn_demo.tf` intentionally excluded** — its Function URL is not
  fronted by the shared OAC pattern and it carries two DynamoDB tables +
  an `npm ci` `null_resource`; forcing it through the module would add
  conditionals that erase the module's simplicity. Rule-of-three is met by
  the three OAC-fronted endpoints.

## Next session — verify the tracer (do this FIRST)

After `aws-login` / credential refresh:

```bash
./scripts/tf.sh millsymills init     # re-init with the module present
./scripts/tf.sh millsymills plan
```

In the plan output, confirm **every** hits Lambda-origin resource shows as
a `moved`/no-op, NOT destroy+create. Specifically scan for:

- `module.hits_lambda.aws_lambda_function_url.this[0]` — **must not be
  recreated.** A recreate changes the `<id>.lambda-url…` hostname, which
  breaks the CloudFront `/api/hits` origin until re-applied.
- `module.hits_lambda.aws_lambda_function.this[0]`,
  `...aws_iam_role.this[0]`, `...aws_cloudfront_origin_access_control.this[0]`,
  the two `...aws_lambda_permission.*[0]`, log group, role attachment.

Expected plan: `0 to add, 0 to change, 0 to destroy` (pure address moves),
or at most in-place updates to tags. **If anything shows destroy+create,
STOP** and fix the `moved` mapping before applying.

Run the same check on the rehearsal stack:

```bash
./scripts/tf.sh p41m0n plan
```

(Note: `enable_hitcounter` may be `false` on a stack — then the moves are
state no-ops and the module creates nothing. Still confirm no destroys.)

## Replicating to inspector_tls.tf and csp_report.tf

Same mechanical transform `hitcounter.tf` already demonstrates:

1. Replace the flat Lambda-core resources (`archive_file`, `aws_iam_role`,
   `aws_iam_role_policy_attachment.*_basic`, `aws_cloudwatch_log_group`,
   `aws_lambda_function`, `aws_lambda_function_url`,
   `aws_cloudfront_origin_access_control`, both `aws_lambda_permission`,
   and the `*_origin_host` local) with one `module "<name>_lambda"` block.
   - `inspector_tls`: `log_retention_days = 14`, no `environment`, omit
     `reserved_concurrent_executions` (defaults to `-1` = unreserved,
     matching today). No extra inline policy.
   - `csp_report`: `log_retention_days = 30`,
     `environment = { REPORT_BUCKET = ... }`,
     `reserved_concurrent_executions = 5`. Keep the S3 bucket + the
     `put-reports` inline policy, re-pointed to `module.csp_lambda.role_id`.
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
