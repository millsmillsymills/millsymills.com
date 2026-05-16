# p41m0n.com teardown + static-image hosting — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tear down the heavy parallel AWS stack on `p41m0n.com` (rehearsal-only Lambdas, alarms, OIDC role, CloudFront access logs, MTA-STS, BIMI, strict response-headers policy) and replace it with a minimal S3+CloudFront site serving one static image. Keep the Proton catchall mail and the shared Terraform state bucket / Route53 zone / IAM OIDC provider untouched.

**Architecture:** One Terraform codebase, two stacks separated by state — the existing pattern. Slim p41m0n via per-feature `enable_*` toggle variables (defaulting to `true` so millsymills is unchanged), plus a `cloudfront_headers_profile` selector for `strict` (millsymills) vs `minimal` (p41m0n) response headers. `moved` blocks accompany every newly-`count`-gated resource to prevent destructive re-addressing. Cleanup of rehearsal-only Astro/script/CI surface (`NO_INDEX`/`SITE_URL` plumbing, `deploy-rehearsal.yml`, leakage-assert scripts, the `rehearsal` GH Environment, `p41m0n.com` references in `inspector_tls.mjs`/`security-controls.ts`) lands in the same coordinated cleanup PR.

**Tech Stack:** Terraform 1.10+ (HCL, AWS provider 6.41), AWS (S3, CloudFront, ACM, Route53, IAM, Lambda, DynamoDB, SNS, KMS), Astro 6 (TypeScript), Bash, GitHub Actions, ImageMagick (`magick`), `exiftool`, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md`.

**Repos:** Most work lands in `millsymills.com` (the Terraform stack + the rehearsal source surface). Content (the meme JPEG + index.html) lands in `p41m0n.com`. Apply phase + verification runs from a `millsymills.com` checkout against AWS using local operator credentials.

> **Amended 2026-05-15 (post-PR-#493):** Phase 4's expected-plan checklist was rewritten after a `state list` audit confirmed p41m0n's deployed state never tracked csp_report/webauthn_demo/MTA-STS — so the teardown destroys ~36 resources (not the originally-anticipated ~70+), there's no ACM cert replacement, and several Phase 5 verification checks now confirm "never existed" rather than "destroyed." Phases 0-3 and the toggle/cleanup mechanics are unchanged. See spec § Domain and stack state at time of writing for the full state inventory.

---

## File structure

### `millsymills.com` repo

**Pre-step PR — `docs/p41m0n-teardown-spec` branch** (already cut):
- Create: nothing.
- Modify: `infra/main.tf`, `infra/cloudfront_logging.tf` (move `data "aws_caller_identity" "current"`).

**Toggle PR — branched off pre-step:**
- Modify: `infra/variables.tf` (add 10 new variables).
- Modify: `infra/inspector_tls.tf`, `infra/csp_report.tf`, `infra/webauthn_demo.tf`, `infra/ct_monitor.tf`, `infra/s3.tf`, `infra/cloudfront_logging.tf`, `infra/github_oidc.tf`, `infra/mta_sts.tf`, `infra/email.tf` (add `count` + `moved` blocks).
- Modify: `infra/acm.tf` (`compact()` SAN list).
- Modify: `infra/cloudfront.tf` (extensive: `aliases` to `compact()`, four origins to `dynamic`, two ordered cache behaviors to `dynamic`, `function_association` to `dynamic`, `response_headers_policy_id` to conditional, gate origin-request + response-headers policies via `count` + `moved`; add new `site_minimal` policy).

**Cleanup PR — branched off toggle PR (or main if toggle merged):**
- Delete: `.github/workflows/deploy-rehearsal.yml`, `scripts/verify-p41m0n.sh`, `scripts/assert-no-rehearsal-leakage.sh`, `scripts/assert-no-url-leakage.sh`, `src/pages/robots.txt.ts`.
- Restore: `public/robots.txt` (deleted Apr 2026 in commit `eb3cc47`).
- Modify: `astro.config.mjs`, `src/layouts/BaseLayout.astro`, `src/layouts/DesktopLayout.astro`, `src/pages/index.astro`, `src/pages/[app].astro`, `src/pages/sitemap.xml.ts`, `src/data/security-controls.ts`, `infra/inspector_tls.mjs`, `infra/cloudfront.tf` (comment-only rewording), `.github/workflows/ci.yml`.

**Apply phase — operator-driven, no PR:**
- Modify: `infra/stacks/p41m0n.tfvars`.

### `p41m0n.com` repo

**Content PR:**
- Create: `index.html`, `face-of-mercy.jpg`.

---

## Phase 0 — Pre-step PR (millsymills.com): relocate `data.aws_caller_identity`

**Why this is its own PR:** isolates a tiny, mechanical Terraform refactor from the larger toggle change. If the relocation breaks something, it's bisectable to a single small commit.

### Task 0.1: Move `data "aws_caller_identity" "current" {}` from `cloudfront_logging.tf` to `main.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/main.tf`
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/cloudfront_logging.tf:8`

- [ ] **Step 1: Append the data source to `infra/main.tf`**

Open `infra/main.tf`. After the `provider "github"` block (around line 49), add:

```hcl

# Account ID is referenced from infra/dnssec.tf (KMS key policy) and
# infra/s3.tf (logs-bucket policy SourceAccount/SourceArn). Lives here
# rather than in cloudfront_logging.tf so it survives any future
# conditional gating of the cloudfront-logging resources.
data "aws_caller_identity" "current" {}
```

- [ ] **Step 2: Remove the data source from `infra/cloudfront_logging.tf:8`**

Open `infra/cloudfront_logging.tf`. Delete line 8 (`data "aws_caller_identity" "current" {}`). Leave the surrounding comment block above it intact.

- [ ] **Step 3: `terraform fmt`**

```bash
cd /Users/mills/Desktop/Projects/millsymills.com
terraform -chdir=infra fmt
```

Expected: no output (both files were already formatted; the move shouldn't introduce drift).

- [ ] **Step 4: `terraform validate` (no backend)**

```bash
terraform -chdir=infra init -backend=false -input=false
terraform -chdir=infra validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Plan against millsymills stack**

```bash
./scripts/tf.sh millsymills init
./scripts/tf.sh millsymills plan
```

Expected: `No changes. Your infrastructure matches the configuration.`

If anything other than "no changes" appears, STOP — the move broke something. Common cause: a subtle typo in the data source name (must be `current` exactly).

- [ ] **Step 6: Plan against p41m0n stack**

```bash
./scripts/tf.sh p41m0n init
./scripts/tf.sh p41m0n plan
```

**Expected:** the same ~43 add / 8 change / 4 destroy *pre-existing drift* baseline as before the move. This step is the data-source-move impact check, NOT a drift-resolution check. p41m0n carries pre-existing drift because csp_report/webauthn/MTA-STS were added to shared TF code over time but only millsymills was re-applied — that drift is resolved later in Phase 4 by the tfvars flip, not here.

The data-source move itself should add zero new plan delta. Verify by stash-comparing if uncertain: `git stash && tf.sh p41m0n plan > /tmp/pre.txt && git stash pop && tf.sh p41m0n plan > /tmp/post.txt && diff /tmp/pre.txt /tmp/post.txt` — expected empty diff.

- [ ] **Step 7: Commit**

```bash
git add infra/main.tf infra/cloudfront_logging.tf
git commit -m "$(cat <<'EOF'
refactor(infra): move data.aws_caller_identity to main.tf

Pre-step for the p41m0n teardown work — the data source is referenced
from dnssec.tf and s3.tf, so it needs to survive the toggle PR's
conditional gating of cloudfront_logging.tf.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push and open PR**

The branch `docs/p41m0n-teardown-spec` already carries the spec commit (`353aedf`). This Phase 0 commit (the data source move) lands on the same branch — they're both small, both prep work for the larger toggle PR, and reviewing them together is easier than splitting.

```bash
git push -u origin docs/p41m0n-teardown-spec
gh pr create --base main --title "docs(specs) + refactor(infra): p41m0n teardown spec + relocate data.aws_caller_identity" --body "$(cat <<'EOF'
## Summary

- Adds `docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md` — the design spec for tearing down most of the parallel p41m0n AWS stack and replacing it with a single static image, kept behind nine new `enable_*` toggles.
- Moves `data "aws_caller_identity" "current" {}` from `infra/cloudfront_logging.tf` to `infra/main.tf` so the data source survives the upcoming conditional gating of the cloudfront-logging resources (referenced from `dnssec.tf` and `s3.tf`).
- Pure refactor; `tf.sh millsymills plan` is empty. `tf.sh p41m0n plan` is unchanged from its pre-move baseline (p41m0n carries pre-existing drift from csp_report/webauthn/MTA-STS that gets resolved later in Phase 4 by the tfvars flip — not by this PR).

## Test plan
- [x] `terraform fmt` clean
- [x] `terraform validate` passes
- [x] `tf.sh millsymills plan` empty
- [x] `tf.sh p41m0n plan` shows only pre-existing drift (zero new delta from this move; stash-compare verified)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for CI green and merge before starting Phase 1.

---

## Phase 1 — Toggle PR (millsymills.com): add `enable_*` variables, gate resources, reshape CloudFront

**Branch off latest `main` after the pre-step PR merges.** Name suggestion: `infra/p41m0n-teardown-toggles`.

### Task 1.1: Add the 10 toggle variables to `infra/variables.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/variables.tf`

- [ ] **Step 1: Append variables**

Append to the end of `infra/variables.tf`:

```hcl

# ─── per-feature toggles for the p41m0n teardown (2026-05-15) ──────────
#
# All defaults are `true` so the millsymills stack is unaffected. The
# p41m0n stack flips them all to `false` (or `"minimal"` for the headers
# profile) via infra/stacks/p41m0n.tfvars. Each toggle is paired with
# `moved` blocks in the gated file so existing state addresses survive
# the count-gating refactor — see the "moved blocks are mandatory"
# section in the spec for the full rationale.

variable "enable_inspector_tls" {
  description = "Provision the inspector_tls Lambda + CloudFront origin/cache-behavior + dedicated /api/tls/* response-headers policy. Drop on stacks without the /inspector/ app."
  type        = bool
  default     = true
}

variable "enable_csp_report" {
  description = "Provision the csp_report Lambda + reports S3 bucket + CloudFront origin/cache-behavior + alarms + SNS topic. Drop on stacks without strict CSP / Reporting-API endpoints."
  type        = bool
  default     = true
}

variable "enable_webauthn_demo" {
  description = "Provision the webauthn_demo Lambda + 2 DynamoDB tables + alarms. Drop on stacks without /demo/passkey."
  type        = bool
  default     = true
}

variable "enable_ct_monitor" {
  description = "Provision the ct_monitor Lambda + SNS topic + EventBridge daily schedule. Drop on stacks without CT log monitoring."
  type        = bool
  default     = true
}

variable "enable_access_logging" {
  description = "Provision the <domain>-logs S3 bucket + S3 server access logging + CloudFront access-log v2 delivery as a coherent unit. Drop on stacks that don't need access logs."
  type        = bool
  default     = true
}

variable "enable_github_deploy_role" {
  description = "Provision the per-stack GitHub OIDC deploy role + its trust + permissions policies + the github_deploy_role_arn output. The aws_iam_openid_connect_provider.github resource itself is account-wide and is NOT gated by this toggle. Drop on stacks without a CI deploy."
  type        = bool
  default     = true
}

variable "enable_index_rewrite" {
  description = "Provision the CloudFront Function that rewrites /foo/ to /foo/index.html, plus its function_association. Drop on stacks that serve a single file (default_root_object handles the apex)."
  type        = bool
  default     = true
}

variable "enable_mta_sts_alias" {
  description = "Provision the mta-sts.<domain> CloudFront alias (A + AAAA) and include the mta-sts SAN on the ACM cert. The discovery TXT is gated independently by enable_mta_sts. Drop on stacks without MTA-STS."
  type        = bool
  default     = true
}

variable "enable_bimi" {
  description = "Publish the default._bimi.<domain> BIMI TXT record. Requires a real /bimi/logo.svg in the site bucket. Drop on stacks with no brand mark."
  type        = bool
  default     = true
}

variable "cloudfront_headers_profile" {
  description = "Which CloudFront response-headers policy to attach to the default cache behavior. \"strict\" = full CSP + Permissions-Policy + COOP/COEP/CORP + Reporting-Endpoints (millsymills); \"minimal\" = HSTS + nosniff + frame-options + Referrer-Policy only (single-image static stacks)."
  type        = string
  default     = "strict"
  validation {
    condition     = contains(["strict", "minimal"], var.cloudfront_headers_profile)
    error_message = "cloudfront_headers_profile must be \"strict\" or \"minimal\"."
  }
}
```

- [ ] **Step 2: `terraform fmt` + `validate`**

```bash
terraform -chdir=infra fmt
terraform -chdir=infra init -backend=false -input=false
terraform -chdir=infra validate
```

Expected: clean fmt; `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/variables.tf
git commit -m "infra(toggles): add nine enable_* booleans + cloudfront_headers_profile"
```

### Task 1.2: Gate `infra/inspector_tls.tf` resources with `count` + `moved` blocks

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/inspector_tls.tf`

- [ ] **Step 1: Add `count` to every standalone resource**

In `infra/inspector_tls.tf`, add `count = var.enable_inspector_tls ? 1 : 0` as the FIRST line inside each of these resource blocks:

- `resource "aws_iam_role" "inspector_tls"` (line 38)
- `resource "aws_iam_role_policy_attachment" "inspector_tls_basic"` (line 51)
- `resource "aws_cloudwatch_log_group" "inspector_tls"` (line 58)
- `resource "aws_lambda_function" "inspector_tls"` (line 63)
- `resource "aws_lambda_function_url" "inspector_tls"` (line 87)
- `resource "aws_cloudfront_origin_access_control" "inspector_tls"` (line 106)
- `resource "aws_lambda_permission" "inspector_tls_cloudfront"` (line 117)

- [ ] **Step 2: Update intra-file references that now hit `[0]` indexed addresses**

- Line 53: `role = aws_iam_role.inspector_tls.name` → `role = aws_iam_role.inspector_tls[0].name`
- Line 65: `role = aws_iam_role.inspector_tls.arn` → `role = aws_iam_role.inspector_tls[0].arn`
- Lines 66-67: `data.archive_file.inspector_tls.output_path` and `.output_base64sha256` — `data.archive_file` doesn't take count, no change.
- Line 74: `depends_on = [aws_cloudwatch_log_group.inspector_tls]` → `depends_on = [aws_cloudwatch_log_group.inspector_tls[0]]`
- Line 88: `function_name = aws_lambda_function.inspector_tls.function_name` → `function_name = aws_lambda_function.inspector_tls[0].function_name`
- Line 120: `function_name = aws_lambda_function.inspector_tls.function_name` → `function_name = aws_lambda_function.inspector_tls[0].function_name`
- Line 131: `replace(replace(aws_lambda_function_url.inspector_tls.function_url, ...))` → `replace(replace(aws_lambda_function_url.inspector_tls[0].function_url, ...))`. Wrap the whole expression so the local resolves to `null` when the toggle is off:

```hcl
locals {
  inspector_tls_origin_host = var.enable_inspector_tls ? replace(replace(aws_lambda_function_url.inspector_tls[0].function_url, "https://", ""), "/", "") : null
}
```

- [ ] **Step 3: Append `moved` blocks at the end of the file**

```hcl

# moved blocks for the count-gating refactor (2026-05-15 p41m0n teardown spec).
# Without these, every existing instance on the millsymills stack would re-address
# from `aws_X.Y` to `aws_X.Y[0]` and Terraform would queue destructive replacements.

moved {
  from = aws_iam_role.inspector_tls
  to   = aws_iam_role.inspector_tls[0]
}

moved {
  from = aws_iam_role_policy_attachment.inspector_tls_basic
  to   = aws_iam_role_policy_attachment.inspector_tls_basic[0]
}

moved {
  from = aws_cloudwatch_log_group.inspector_tls
  to   = aws_cloudwatch_log_group.inspector_tls[0]
}

moved {
  from = aws_lambda_function.inspector_tls
  to   = aws_lambda_function.inspector_tls[0]
}

moved {
  from = aws_lambda_function_url.inspector_tls
  to   = aws_lambda_function_url.inspector_tls[0]
}

moved {
  from = aws_cloudfront_origin_access_control.inspector_tls
  to   = aws_cloudfront_origin_access_control.inspector_tls[0]
}

moved {
  from = aws_lambda_permission.inspector_tls_cloudfront
  to   = aws_lambda_permission.inspector_tls_cloudfront[0]
}
```

- [ ] **Step 4: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success! The configuration is valid.`

(External references from `cloudfront.tf` to `aws_lambda_function_url.inspector_tls.function_url` etc. will be fixed in Task 1.12.)

- [ ] **Step 5: Commit**

```bash
git add infra/inspector_tls.tf
git commit -m "infra(toggles): gate inspector_tls.tf resources behind enable_inspector_tls"
```

### Task 1.3: Gate `infra/csp_report.tf` resources with `count` + `moved` blocks

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/csp_report.tf`

- [ ] **Step 1: Add `count = var.enable_csp_report ? 1 : 0` to each resource**

Resources to gate (full list from the spec):

- `aws_s3_bucket.csp_report` (line 34)
- `aws_s3_bucket_public_access_block.csp_report` (line 38)
- `aws_s3_bucket_ownership_controls.csp_report` (line 47)
- `aws_s3_bucket_server_side_encryption_configuration.csp_report` (line 54)
- `aws_s3_bucket_lifecycle_configuration.csp_report` (line 63)
- `aws_s3_bucket_policy.csp_report` (line 82)
- `aws_iam_role.csp_report` (line 120)
- `aws_iam_role_policy_attachment.csp_report_basic` (line 133)
- `aws_iam_role_policy.csp_report_put` (line 138)
- `aws_cloudwatch_log_group.csp_report` (line 152)
- `aws_lambda_function.csp_report` (line 157)
- `aws_lambda_function_url.csp_report` (line 183)
- `aws_cloudfront_origin_access_control.csp_report` (line 188)
- `aws_lambda_permission.csp_report_cloudfront` (line 201)
- `aws_sns_topic.csp_report_ops` (line 246)
- `aws_sns_topic_subscription.csp_report_ops_email` (line 250)
- `aws_cloudwatch_metric_alarm.csp_report_throttles` (line 260)
- `aws_cloudwatch_log_metric_filter.csp_report_put_failed` (line 283)
- `aws_cloudwatch_metric_alarm.csp_report_put_failed` (line 301)
- `aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded` (line 321)
- `aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded` (line 335)

- [ ] **Step 2: Update intra-file references to use `[0]`**

Walk every reference within `csp_report.tf` and rewrite to indexed form. Examples:
- `bucket = aws_s3_bucket.csp_report.id` → `bucket = aws_s3_bucket.csp_report[0].id`
- `Resource = "${aws_s3_bucket.csp_report.arn}/reports/*"` → `Resource = "${aws_s3_bucket.csp_report[0].arn}/reports/*"`
- `role = aws_iam_role.csp_report.name` → `role = aws_iam_role.csp_report[0].name`
- `function_name = aws_lambda_function.csp_report.function_name` → `function_name = aws_lambda_function.csp_report[0].function_name`
- `topic_arn = aws_sns_topic.csp_report_ops.arn` → `topic_arn = aws_sns_topic.csp_report_ops[0].arn`
- `endpoint = local.ct_alert_email` → unchanged (local from ct_monitor.tf, stays)
- `log_group_name = aws_cloudwatch_log_group.csp_report.name` → `log_group_name = aws_cloudwatch_log_group.csp_report[0].name`
- `alarm_actions = [aws_sns_topic.csp_report_ops.arn]` → `alarm_actions = [aws_sns_topic.csp_report_ops[0].arn]`
- `ok_actions = [aws_sns_topic.csp_report_ops.arn]` → `ok_actions = [aws_sns_topic.csp_report_ops[0].arn]`
- `dimensions = { FunctionName = aws_lambda_function.csp_report.function_name }` → `dimensions = { FunctionName = aws_lambda_function.csp_report[0].function_name }`
- `namespace = aws_cloudwatch_log_metric_filter.csp_report_put_failed.metric_transformation[0].namespace` → `aws_cloudwatch_log_metric_filter.csp_report_put_failed[0].metric_transformation[0].namespace` (note: the `[0]` for `metric_transformation` is the existing block index, not the new count index; both stack)
- Same pattern for `csp_report_body_cap_exceeded` references in alarm blocks
- `depends_on = [aws_cloudwatch_log_group.csp_report]` → `depends_on = [aws_cloudwatch_log_group.csp_report[0]]`
- `depends_on = [aws_cloudfront_distribution.site]` (line 213) → unchanged, distribution stays unconditional
- `REPORT_BUCKET = aws_s3_bucket.csp_report.id` → `aws_s3_bucket.csp_report[0].id`

Update the local at line 217:

```hcl
locals {
  csp_report_origin_host = var.enable_csp_report ? trimsuffix(
    replace(aws_lambda_function_url.csp_report[0].function_url, "https://", ""),
    "/",
  ) : null
}
```

- [ ] **Step 3: Append `moved` blocks at the end of the file**

One `moved` block per gated resource:

```hcl

# moved blocks for the count-gating refactor (2026-05-15).

moved { from = aws_s3_bucket.csp_report,                                   to = aws_s3_bucket.csp_report[0] }
moved { from = aws_s3_bucket_public_access_block.csp_report,               to = aws_s3_bucket_public_access_block.csp_report[0] }
moved { from = aws_s3_bucket_ownership_controls.csp_report,                to = aws_s3_bucket_ownership_controls.csp_report[0] }
moved { from = aws_s3_bucket_server_side_encryption_configuration.csp_report, to = aws_s3_bucket_server_side_encryption_configuration.csp_report[0] }
moved { from = aws_s3_bucket_lifecycle_configuration.csp_report,           to = aws_s3_bucket_lifecycle_configuration.csp_report[0] }
moved { from = aws_s3_bucket_policy.csp_report,                            to = aws_s3_bucket_policy.csp_report[0] }
moved { from = aws_iam_role.csp_report,                                    to = aws_iam_role.csp_report[0] }
moved { from = aws_iam_role_policy_attachment.csp_report_basic,            to = aws_iam_role_policy_attachment.csp_report_basic[0] }
moved { from = aws_iam_role_policy.csp_report_put,                         to = aws_iam_role_policy.csp_report_put[0] }
moved { from = aws_cloudwatch_log_group.csp_report,                        to = aws_cloudwatch_log_group.csp_report[0] }
moved { from = aws_lambda_function.csp_report,                             to = aws_lambda_function.csp_report[0] }
moved { from = aws_lambda_function_url.csp_report,                         to = aws_lambda_function_url.csp_report[0] }
moved { from = aws_cloudfront_origin_access_control.csp_report,            to = aws_cloudfront_origin_access_control.csp_report[0] }
moved { from = aws_lambda_permission.csp_report_cloudfront,                to = aws_lambda_permission.csp_report_cloudfront[0] }
moved { from = aws_sns_topic.csp_report_ops,                               to = aws_sns_topic.csp_report_ops[0] }
moved { from = aws_sns_topic_subscription.csp_report_ops_email,            to = aws_sns_topic_subscription.csp_report_ops_email[0] }
moved { from = aws_cloudwatch_metric_alarm.csp_report_throttles,           to = aws_cloudwatch_metric_alarm.csp_report_throttles[0] }
moved { from = aws_cloudwatch_log_metric_filter.csp_report_put_failed,     to = aws_cloudwatch_log_metric_filter.csp_report_put_failed[0] }
moved { from = aws_cloudwatch_metric_alarm.csp_report_put_failed,          to = aws_cloudwatch_metric_alarm.csp_report_put_failed[0] }
moved { from = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded, to = aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded[0] }
moved { from = aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded,   to = aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded[0] }
```

- [ ] **Step 4: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/csp_report.tf
git commit -m "infra(toggles): gate csp_report.tf resources behind enable_csp_report"
```

### Task 1.4: Gate `infra/webauthn_demo.tf` resources with `count` + `moved` blocks

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/webauthn_demo.tf`

- [ ] **Step 1: Add `count = var.enable_webauthn_demo ? 1 : 0` to each resource**

Resources to gate:
- `aws_dynamodb_table.webauthn_credentials` (line 36)
- `aws_dynamodb_table.webauthn_sessions` (line 76)
- `null_resource.webauthn_demo_install` (line 106)
- `aws_iam_role.webauthn_demo` (line 132)
- `aws_cloudwatch_log_group.webauthn_demo` (line 147)
- `aws_iam_role_policy.webauthn_demo` (line 156)
- `aws_lambda_function.webauthn_demo` (line 192)
- `aws_lambda_function_url.webauthn_demo` (line 230)
- `aws_cloudwatch_metric_alarm.webauthn_demo_throttles` (line 259)
- `aws_cloudwatch_metric_alarm.webauthn_demo_errors` (line 283)
- `aws_cloudwatch_metric_alarm.webauthn_demo_body_too_large` (line 309)
- `aws_cloudwatch_metric_alarm.webauthn_demo_invocations_zero` (line 332)

The `data "archive_file" "webauthn_demo"` (line 117) does NOT take `count` (data sources can use `count` in TF 1.10+ but it complicates archive plans; safer to leave it — its `depends_on` already references the null_resource which becomes empty when toggled off, and the archive itself is harmless).

- [ ] **Step 2: Add output gating**

Wrap the `output "webauthn_demo_url"` (line 242) so it only emits when the lambda exists:

```hcl
output "webauthn_demo_url" {
  description = "Public HTTPS endpoint for the WebAuthn demo Lambda. Routes /registration/options, /registration/verify, /authentication/options, /authentication/verify (all POST). Wire this into the `/demo/passkey` Astro page in the followup page-slice PR (#445)."
  value       = var.enable_webauthn_demo ? aws_lambda_function_url.webauthn_demo[0].function_url : null
}
```

- [ ] **Step 3: Update intra-file references to `[0]`**

- Line 129: `depends_on = [null_resource.webauthn_demo_install]` → `depends_on = [null_resource.webauthn_demo_install[0]]`
- Lines 158-189 (role policy): `role = aws_iam_role.webauthn_demo.id` → `aws_iam_role.webauthn_demo[0].id`; `Resource = aws_cloudwatch_log_group.webauthn_demo.arn` and `${...arn}:*` → `aws_cloudwatch_log_group.webauthn_demo[0].arn`; `Resource = aws_dynamodb_table.webauthn_credentials.arn` → `aws_dynamodb_table.webauthn_credentials[0].arn`; same for sessions.
- Lines 193-223: `role = aws_iam_role.webauthn_demo.arn` → `aws_iam_role.webauthn_demo[0].arn`; environment vars `aws_dynamodb_table.webauthn_credentials.name` → `[0].name`, same for sessions; `depends_on = [aws_cloudwatch_log_group.webauthn_demo]` → `[aws_cloudwatch_log_group.webauthn_demo[0]]`.
- Line 231: `function_name = aws_lambda_function.webauthn_demo.function_name` → `aws_lambda_function.webauthn_demo[0].function_name`.
- Lines 270-275, 297-300, 320, 346-348: alarm `alarm_actions`/`ok_actions` reference `aws_sns_topic.csp_report_ops.arn` → `aws_sns_topic.csp_report_ops[0].arn` (the topic itself is now `count`-gated by `enable_csp_report` per Task 1.3). `dimensions = { FunctionName = aws_lambda_function.webauthn_demo.function_name }` → `aws_lambda_function.webauthn_demo[0].function_name`.

- [ ] **Step 4: Append `moved` blocks**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).

moved { from = aws_dynamodb_table.webauthn_credentials,                    to = aws_dynamodb_table.webauthn_credentials[0] }
moved { from = aws_dynamodb_table.webauthn_sessions,                       to = aws_dynamodb_table.webauthn_sessions[0] }
moved { from = null_resource.webauthn_demo_install,                        to = null_resource.webauthn_demo_install[0] }
moved { from = aws_iam_role.webauthn_demo,                                 to = aws_iam_role.webauthn_demo[0] }
moved { from = aws_cloudwatch_log_group.webauthn_demo,                     to = aws_cloudwatch_log_group.webauthn_demo[0] }
moved { from = aws_iam_role_policy.webauthn_demo,                          to = aws_iam_role_policy.webauthn_demo[0] }
moved { from = aws_lambda_function.webauthn_demo,                          to = aws_lambda_function.webauthn_demo[0] }
moved { from = aws_lambda_function_url.webauthn_demo,                      to = aws_lambda_function_url.webauthn_demo[0] }
moved { from = aws_cloudwatch_metric_alarm.webauthn_demo_throttles,        to = aws_cloudwatch_metric_alarm.webauthn_demo_throttles[0] }
moved { from = aws_cloudwatch_metric_alarm.webauthn_demo_errors,           to = aws_cloudwatch_metric_alarm.webauthn_demo_errors[0] }
moved { from = aws_cloudwatch_metric_alarm.webauthn_demo_body_too_large,   to = aws_cloudwatch_metric_alarm.webauthn_demo_body_too_large[0] }
moved { from = aws_cloudwatch_metric_alarm.webauthn_demo_invocations_zero, to = aws_cloudwatch_metric_alarm.webauthn_demo_invocations_zero[0] }
```

- [ ] **Step 5: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 6: Commit**

```bash
git add infra/webauthn_demo.tf
git commit -m "infra(toggles): gate webauthn_demo.tf resources behind enable_webauthn_demo"
```

### Task 1.5: Gate `infra/ct_monitor.tf` resources with `count` + `moved` blocks

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/ct_monitor.tf`

- [ ] **Step 1: Add `count = var.enable_ct_monitor ? 1 : 0` to each resource**

Resources to gate:
- `aws_sns_topic.ct_monitor` (line 18)
- `aws_sns_topic_subscription.ct_monitor_email` (line 22)
- `aws_iam_role.ct_monitor` (line 34)
- `aws_iam_role_policy_attachment.ct_monitor_basic` (line 47)
- `aws_iam_role_policy.ct_monitor_publish` (line 52)
- `aws_cloudwatch_log_group.ct_monitor` (line 68)
- `aws_lambda_function.ct_monitor` (line 73)
- `aws_cloudwatch_event_rule.ct_monitor` (line 96)
- `aws_cloudwatch_event_target.ct_monitor` (line 102)
- `aws_lambda_permission.ct_monitor_eventbridge` (line 108)

The `local.ct_alert_email` (line 14) is a pure string and stays unconditional — it's referenced from `csp_report.tf:253` where it sets the `endpoint` of `aws_sns_topic_subscription.csp_report_ops_email` and must remain available even when ct_monitor is off.

- [ ] **Step 2: Update intra-file references to `[0]`**

- Line 25: `topic_arn = aws_sns_topic.ct_monitor.arn` → `aws_sns_topic.ct_monitor[0].arn`
- Line 49: `role = aws_iam_role.ct_monitor.name` → `aws_iam_role.ct_monitor[0].name`
- Line 54: `role = aws_iam_role.ct_monitor.id` → `aws_iam_role.ct_monitor[0].id`
- Line 61: `Resource = aws_sns_topic.ct_monitor.arn` → `aws_sns_topic.ct_monitor[0].arn`
- Line 75: `role = aws_iam_role.ct_monitor.arn` → `aws_iam_role.ct_monitor[0].arn`
- Line 87: `SNS_TOPIC_ARN = aws_sns_topic.ct_monitor.arn` → `aws_sns_topic.ct_monitor[0].arn`
- Line 93: `depends_on = [aws_cloudwatch_log_group.ct_monitor]` → `[aws_cloudwatch_log_group.ct_monitor[0]]`
- Line 103: `rule = aws_cloudwatch_event_rule.ct_monitor.name` → `aws_cloudwatch_event_rule.ct_monitor[0].name`
- Line 105: `arn = aws_lambda_function.ct_monitor.arn` → `aws_lambda_function.ct_monitor[0].arn`
- Line 111: `function_name = aws_lambda_function.ct_monitor.function_name` → `aws_lambda_function.ct_monitor[0].function_name`
- Line 113: `source_arn = aws_cloudwatch_event_rule.ct_monitor.arn` → `aws_cloudwatch_event_rule.ct_monitor[0].arn`

- [ ] **Step 3: Append `moved` blocks**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).

moved { from = aws_sns_topic.ct_monitor,                  to = aws_sns_topic.ct_monitor[0] }
moved { from = aws_sns_topic_subscription.ct_monitor_email, to = aws_sns_topic_subscription.ct_monitor_email[0] }
moved { from = aws_iam_role.ct_monitor,                   to = aws_iam_role.ct_monitor[0] }
moved { from = aws_iam_role_policy_attachment.ct_monitor_basic, to = aws_iam_role_policy_attachment.ct_monitor_basic[0] }
moved { from = aws_iam_role_policy.ct_monitor_publish,    to = aws_iam_role_policy.ct_monitor_publish[0] }
moved { from = aws_cloudwatch_log_group.ct_monitor,       to = aws_cloudwatch_log_group.ct_monitor[0] }
moved { from = aws_lambda_function.ct_monitor,            to = aws_lambda_function.ct_monitor[0] }
moved { from = aws_cloudwatch_event_rule.ct_monitor,      to = aws_cloudwatch_event_rule.ct_monitor[0] }
moved { from = aws_cloudwatch_event_target.ct_monitor,    to = aws_cloudwatch_event_target.ct_monitor[0] }
moved { from = aws_lambda_permission.ct_monitor_eventbridge, to = aws_lambda_permission.ct_monitor_eventbridge[0] }
```

- [ ] **Step 4: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 5: Commit**

```bash
git add infra/ct_monitor.tf
git commit -m "infra(toggles): gate ct_monitor.tf resources behind enable_ct_monitor"
```

### Task 1.6: Gate the `<domain>-logs` bucket + `aws_s3_bucket_logging.site` in `infra/s3.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/s3.tf`

- [ ] **Step 1: Add `count = var.enable_access_logging ? 1 : 0` to the logging block + logs bucket + supporting resources**

Resources to gate:
- `aws_s3_bucket_logging.site` (line 57)
- `aws_s3_bucket.logs` (line 118)
- `aws_s3_bucket_public_access_block.logs` (line 123)
- `aws_s3_bucket_ownership_controls.logs` (line 132)
- `aws_s3_bucket_server_side_encryption_configuration.logs` (line 139)
- `aws_s3_bucket_versioning.logs` (line 155)
- `aws_s3_bucket_lifecycle_configuration.logs` (line 162)
- `aws_s3_bucket_policy.logs` (line 210)

NOT gated: `aws_s3_bucket.site` and its 8 supporting resources, `aws_cloudfront_origin_access_control.site`, `aws_s3_bucket_policy.site`. Those stay unconditional.

- [ ] **Step 2: Update intra-file references**

- Line 60: `target_bucket = aws_s3_bucket.logs.id` → `aws_s3_bucket.logs[0].id` (already inside a count-gated block, so `[0]` of the surrounding logging block aligns with `[0]` of the bucket)
- Lines 226, 257, 258: `aws_s3_bucket.logs.arn` → `aws_s3_bucket.logs[0].arn`

- [ ] **Step 3: Append `moved` blocks at the end of `s3.tf`**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).

moved { from = aws_s3_bucket_logging.site,                                  to = aws_s3_bucket_logging.site[0] }
moved { from = aws_s3_bucket.logs,                                          to = aws_s3_bucket.logs[0] }
moved { from = aws_s3_bucket_public_access_block.logs,                      to = aws_s3_bucket_public_access_block.logs[0] }
moved { from = aws_s3_bucket_ownership_controls.logs,                       to = aws_s3_bucket_ownership_controls.logs[0] }
moved { from = aws_s3_bucket_server_side_encryption_configuration.logs,     to = aws_s3_bucket_server_side_encryption_configuration.logs[0] }
moved { from = aws_s3_bucket_versioning.logs,                               to = aws_s3_bucket_versioning.logs[0] }
moved { from = aws_s3_bucket_lifecycle_configuration.logs,                  to = aws_s3_bucket_lifecycle_configuration.logs[0] }
moved { from = aws_s3_bucket_policy.logs,                                   to = aws_s3_bucket_policy.logs[0] }
```

- [ ] **Step 4: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 5: Commit**

```bash
git add infra/s3.tf
git commit -m "infra(toggles): gate logs bucket + s3_bucket_logging behind enable_access_logging"
```

### Task 1.7: Gate `infra/cloudfront_logging.tf` resources with `count` + `moved` blocks

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/cloudfront_logging.tf`

- [ ] **Step 1: Add `count = var.enable_access_logging ? 1 : 0` to all three resources**

- `aws_cloudwatch_log_delivery_source.cloudfront_access` (line 10)
- `aws_cloudwatch_log_delivery_destination.cloudfront_access_s3` (line 17)
- `aws_cloudwatch_log_delivery.cloudfront_access` (line 27)

- [ ] **Step 2: Update intra-file references to `[0]` and to the now-`[0]`-indexed logs bucket**

- Line 23: `destination_resource_arn = aws_s3_bucket.logs.arn` → `aws_s3_bucket.logs[0].arn`
- Line 30: `delivery_source_name = aws_cloudwatch_log_delivery_source.cloudfront_access.name` → `aws_cloudwatch_log_delivery_source.cloudfront_access[0].name`
- Line 31: `delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3.arn` → `aws_cloudwatch_log_delivery_destination.cloudfront_access_s3[0].arn`
- Line 38: `depends_on = [aws_s3_bucket_policy.logs]` → `[aws_s3_bucket_policy.logs[0]]`

- [ ] **Step 3: Append `moved` blocks**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).

moved { from = aws_cloudwatch_log_delivery_source.cloudfront_access,      to = aws_cloudwatch_log_delivery_source.cloudfront_access[0] }
moved { from = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3, to = aws_cloudwatch_log_delivery_destination.cloudfront_access_s3[0] }
moved { from = aws_cloudwatch_log_delivery.cloudfront_access,             to = aws_cloudwatch_log_delivery.cloudfront_access[0] }
```

- [ ] **Step 4: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 5: Commit**

```bash
git add infra/cloudfront_logging.tf
git commit -m "infra(toggles): gate cloudfront_logging.tf behind enable_access_logging"
```

### Task 1.8: Gate the GitHub deploy role in `infra/github_oidc.tf` (NOT the OIDC provider)

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/github_oidc.tf`

- [ ] **Step 1: Add `count = var.enable_github_deploy_role ? 1 : 0` to the deploy-role resources only**

Resources to gate:
- `aws_iam_role.github_deploy` (line 71)
- `aws_iam_role_policy.github_deploy` (line 110)

NOT gated:
- `aws_iam_openid_connect_provider.github` (line 29) — account-wide; destroying from p41m0n's state would break millsymills.
- `data "aws_iam_policy_document" "github_deploy_trust"` (line 35) — data sources don't take count cleanly; the resource that consumes it (`aws_iam_role.github_deploy`) is gated, so the data source is just unused when the role is off. Harmless.
- `data "aws_iam_policy_document" "github_deploy"` (line 77) — same.

- [ ] **Step 2: Update the output**

```hcl
output "github_deploy_role_arn" {
  description = "Pass this to the GitHub Actions deploy workflow as the AWS_DEPLOY_ROLE_ARN env-scoped variable on the matching GitHub Environment (production for deploy.yml). Null on stacks with enable_github_deploy_role=false."
  value       = var.enable_github_deploy_role ? aws_iam_role.github_deploy[0].arn : null
}
```

- [ ] **Step 3: Update intra-file references**

- Line 113: `role = aws_iam_role.github_deploy.id` → `aws_iam_role.github_deploy[0].id`

- [ ] **Step 4: Append `moved` blocks**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).
# aws_iam_openid_connect_provider.github is intentionally NOT moved —
# it stays unconditional (account-wide resource shared with millsymills).

moved { from = aws_iam_role.github_deploy,        to = aws_iam_role.github_deploy[0] }
moved { from = aws_iam_role_policy.github_deploy, to = aws_iam_role_policy.github_deploy[0] }
```

- [ ] **Step 5: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 6: Commit**

```bash
git add infra/github_oidc.tf
git commit -m "infra(toggles): gate github_deploy role behind enable_github_deploy_role"
```

### Task 1.9: Gate the MTA-STS A/AAAA records in `infra/mta_sts.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/mta_sts.tf`

- [ ] **Step 1: Add `count` to the alias records**

- `aws_route53_record.mta_sts_a` (line 31): add `count = var.enable_mta_sts_alias ? 1 : 0`
- `aws_route53_record.mta_sts_aaaa` (line 43): add `count = var.enable_mta_sts_alias ? 1 : 0`

The `aws_route53_record.mta_sts_txt` (line 55) already has `count = var.enable_mta_sts ? 1 : 0` — leave unchanged.

- [ ] **Step 2: Append `moved` blocks**

```hcl

# moved blocks for the count-gating refactor (2026-05-15).
# aws_route53_record.mta_sts_txt was already count-gated via enable_mta_sts; no move needed.

moved { from = aws_route53_record.mta_sts_a,    to = aws_route53_record.mta_sts_a[0] }
moved { from = aws_route53_record.mta_sts_aaaa, to = aws_route53_record.mta_sts_aaaa[0] }
```

- [ ] **Step 3: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 4: Commit**

```bash
git add infra/mta_sts.tf
git commit -m "infra(toggles): gate mta-sts A/AAAA aliases behind enable_mta_sts_alias"
```

### Task 1.10: Gate the BIMI record in `infra/email.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/email.tf`

- [ ] **Step 1: Add `count = var.enable_bimi ? 1 : 0` to the BIMI record**

- `aws_route53_record.bimi` (line 126)

NOT gated: every other record in this file (mx, apex_txt, dkim, dmarc, tlsrpt). Mail catchall stays on.

- [ ] **Step 2: Append `moved` block**

```hcl

# moved block for the count-gating refactor (2026-05-15).

moved { from = aws_route53_record.bimi, to = aws_route53_record.bimi[0] }
```

- [ ] **Step 3: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 4: Commit**

```bash
git add infra/email.tf
git commit -m "infra(toggles): gate BIMI record behind enable_bimi"
```

### Task 1.11: Reshape ACM cert SAN list in `infra/acm.tf` to use `compact()`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/acm.tf`

- [ ] **Step 1: Replace the static SAN list with a conditional**

Replace lines 11-14:

```hcl
  # `mta-sts.<domain>` is included unconditionally so the cert covers
  # the subdomain even before MTA-STS is enabled (`var.enable_mta_sts`
  # gates only the Route53 publish; the cert SAN + CloudFront alias
  # are cheap to ship and let the user flip the policy on later
  # without a cert-replacement round-trip). See `infra/mta_sts.tf`.
  subject_alternative_names = [
    "www.${var.domain}",
    "mta-sts.${var.domain}",
  ]
```

with:

```hcl
  # The `mta-sts.<domain>` SAN is gated on `var.enable_mta_sts_alias`.
  # When true (millsymills default), the cert covers apex + www + mta-sts
  # so the operator can flip MTA-STS on/off via `enable_mta_sts` without
  # a cert-replacement round-trip. When false (p41m0n teardown), the cert
  # shrinks to apex + www, freeing the SAN slot and avoiding ACM renewals
  # on a subdomain that resolves to nothing.
  subject_alternative_names = compact([
    "www.${var.domain}",
    var.enable_mta_sts_alias ? "mta-sts.${var.domain}" : "",
  ])
```

The `aws_acm_certificate.site` resource itself does NOT take `count` (the cert is still required for both stacks); only its SAN list changes. The existing `create_before_destroy = true` lifecycle handles the SAN-shrink replacement safely.

- [ ] **Step 2: `terraform validate`**

```bash
terraform -chdir=infra validate
```

Expected: `Success!`

- [ ] **Step 3: Commit**

```bash
git add infra/acm.tf
git commit -m "infra(acm): gate mta-sts SAN behind enable_mta_sts_alias"
```

### Task 1.12: Reshape `infra/cloudfront.tf` (the big one)

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/cloudfront.tf`

This task touches the largest file in the toggle PR. Work it in the order below.

- [ ] **Step 1: Gate `aws_cloudfront_function.index_rewrite` (line 1)**

Add `count = var.enable_index_rewrite ? 1 : 0`.

- [ ] **Step 2: Gate the two origin-request policies**

- `aws_cloudfront_origin_request_policy.inspector_tls` (line 23): add `count = var.enable_inspector_tls ? 1 : 0`
- `aws_cloudfront_origin_request_policy.csp_report` (line 56): add `count = var.enable_csp_report ? 1 : 0`

- [ ] **Step 3: Gate the strict response-headers policy and add the minimal one**

`aws_cloudfront_response_headers_policy.site` (line 76): add `count = var.cloudfront_headers_profile == "strict" ? 1 : 0` as the first line.

After the `aws_cloudfront_response_headers_policy.site` block, add a new resource:

```hcl
# Minimal response-headers policy for stacks that don't ship the strict
# CSP/COOP/COEP/CORP/Permissions-Policy bundle. Used by the p41m0n
# static-image stack (no JS, no third-party assets, single image).
# HSTS + nosniff + frame-options + Referrer-Policy is the floor — every
# property below is independent of CSP and should ship on every stack.
resource "aws_cloudfront_response_headers_policy" "site_minimal" {
  count = var.cloudfront_headers_profile == "minimal" ? 1 : 0

  name    = "${replace(var.domain, ".", "-")}-security-headers-minimal"
  comment = "Minimal security headers for ${var.domain} (HSTS + nosniff + frame-options + Referrer-Policy)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}
```

- [ ] **Step 4: Gate the `api` and `csp_report` response-headers policies**

- `aws_cloudfront_response_headers_policy.api` (line 188): add `count = var.enable_inspector_tls ? 1 : 0`
- `aws_cloudfront_response_headers_policy.csp_report` (line 246): add `count = var.enable_csp_report ? 1 : 0`

- [ ] **Step 5: Reshape `aws_cloudfront_distribution.site.aliases`**

Line 287:

```hcl
  aliases             = [var.domain, "www.${var.domain}", "mta-sts.${var.domain}"]
```

becomes:

```hcl
  aliases = compact([
    var.domain,
    "www.${var.domain}",
    var.enable_mta_sts_alias ? "mta-sts.${var.domain}" : "",
  ])
```

- [ ] **Step 6: Reshape the four `origin` blocks**

The S3 origin (lines 290-294) stays unconditional. Wrap the three Lambda-backed origins in `dynamic` blocks. Replace lines 296-327 (the inspector_tls + csp_report origin blocks):

```hcl
  dynamic "origin" {
    for_each = var.enable_inspector_tls ? [1] : []
    content {
      domain_name              = local.inspector_tls_origin_host
      origin_id                = "lambda-${local.inspector_tls_name}"
      origin_access_control_id = aws_cloudfront_origin_access_control.inspector_tls[0].id

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  dynamic "origin" {
    for_each = var.enable_csp_report ? [1] : []
    content {
      domain_name              = local.csp_report_origin_host
      origin_id                = "lambda-${local.csp_report_name}"
      origin_access_control_id = aws_cloudfront_origin_access_control.csp_report[0].id

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }
```

(The webauthn_demo Function URL is `authorization_type = NONE` and is NOT a CloudFront origin today — see `webauthn_demo.tf:226-227`. Nothing to add here.)

- [ ] **Step 7: Reshape `default_cache_behavior`**

In the `default_cache_behavior` block (line 329), change:

```hcl
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id
```

to:

```hcl
    response_headers_policy_id = var.cloudfront_headers_profile == "minimal" ? aws_cloudfront_response_headers_policy.site_minimal[0].id : aws_cloudfront_response_headers_policy.site[0].id
```

Wrap the `function_association` block (lines 340-343) in a `dynamic`:

```hcl
    dynamic "function_association" {
      for_each = var.enable_index_rewrite ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.index_rewrite[0].arn
      }
    }
```

- [ ] **Step 8: Reshape the two `ordered_cache_behavior` blocks**

Replace lines 353-387 (the `/api/tls/*` and `/api/csp-report` cache behaviors) with `dynamic` versions:

```hcl
  dynamic "ordered_cache_behavior" {
    for_each = var.enable_inspector_tls ? [1] : []
    content {
      path_pattern           = "/api/tls/*"
      target_origin_id       = "lambda-${local.inspector_tls_name}"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      viewer_protocol_policy = "https-only"
      compress               = true

      cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      origin_request_policy_id   = aws_cloudfront_origin_request_policy.inspector_tls[0].id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.api[0].id
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.enable_csp_report ? [1] : []
    content {
      path_pattern           = "/api/csp-report"
      target_origin_id       = "lambda-${local.csp_report_name}"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      viewer_protocol_policy = "https-only"
      compress               = true

      cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      origin_request_policy_id   = aws_cloudfront_origin_request_policy.csp_report[0].id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.csp_report[0].id
    }
  }
```

- [ ] **Step 9: Append `moved` blocks at the end of `cloudfront.tf`**

```hcl

# moved blocks for the count-gating refactor (2026-05-15 p41m0n teardown spec).

moved { from = aws_cloudfront_function.index_rewrite,             to = aws_cloudfront_function.index_rewrite[0] }
moved { from = aws_cloudfront_origin_request_policy.inspector_tls, to = aws_cloudfront_origin_request_policy.inspector_tls[0] }
moved { from = aws_cloudfront_origin_request_policy.csp_report,    to = aws_cloudfront_origin_request_policy.csp_report[0] }
moved { from = aws_cloudfront_response_headers_policy.api,         to = aws_cloudfront_response_headers_policy.api[0] }
moved { from = aws_cloudfront_response_headers_policy.csp_report,  to = aws_cloudfront_response_headers_policy.csp_report[0] }
moved { from = aws_cloudfront_response_headers_policy.site,        to = aws_cloudfront_response_headers_policy.site[0] }
```

- [ ] **Step 10: `terraform fmt` + `validate`**

```bash
terraform -chdir=infra fmt
terraform -chdir=infra validate
```

Expected: clean fmt; `Success!`

- [ ] **Step 11: Commit**

```bash
git add infra/cloudfront.tf
git commit -m "infra(toggles): reshape cloudfront.tf for per-feature gating + minimal headers profile"
```

### Task 1.13: Verify the toggle PR introduces no new drift

**Files:** none (verification only).

**Important:** `scripts/tf.sh`'s stale-state guard refuses to plan against a stack other than the most recently inited one (it tracks the active stack via `infra/.terraform/.stack`). Always interleave init + plan per stack rather than batching them.

**Critical context (per 2026-05-15 amendment):** millsymills's state matches the TF code today, so its plan must come back empty. p41m0n's state DOES NOT match — it has ~43 add / 8 change / 4 destroy of pre-existing drift because csp_report/webauthn/MTA-STS were added to shared TF code but only millsymills was re-applied. The toggle PR's defaults are all `true`/`"strict"`, so for p41m0n the toggle PR alone (no tfvars change) preserves the exact same drift baseline. The acceptance gate for p41m0n is therefore "no NEW resources appear in the plan that weren't there pre-toggle" — a diff-of-plans, not a plan-empty assertion.

- [ ] **Step 1: Capture the pre-toggle baseline plans (run BEFORE the toggle PR's local commits land in your working tree — i.e., from latest `origin/main`)**

If you've been working in a feature branch with toggle changes already committed locally, stash or switch to `origin/main` first:

```bash
git fetch origin main
git stash --include-untracked || true  # if WIP present
git switch --detach origin/main
./scripts/tf.sh millsymills init && ./scripts/tf.sh millsymills plan -no-color > /tmp/mills-pre-toggle.plan 2>&1
./scripts/tf.sh p41m0n init && ./scripts/tf.sh p41m0n plan -no-color > /tmp/p41m0n-pre-toggle.plan 2>&1
git switch -  # back to your toggle branch
git stash pop || true
```

Save those two baseline plans — they're the diff reference.

- [ ] **Step 2: Init + plan millsymills (with toggle changes applied)**

```bash
./scripts/tf.sh millsymills init
./scripts/tf.sh millsymills plan -no-color > /tmp/mills-post-toggle.plan
```

**Expected:** `No changes. Your infrastructure matches the configuration.` (Plus possibly the pre-existing webauthn `source_code_hash` drift if that wasn't cleaned earlier — those resources are unchanged by the toggle.)

If anything other than "no changes" appears beyond pre-existing drift: STOP. Most likely cause is a missing `moved` block or a missed reference rewrite. Cross-check the resource address Terraform wants to destroy/create against the lists in Tasks 1.2-1.12.

- [ ] **Step 3: Init + plan p41m0n (with toggle changes applied)**

```bash
./scripts/tf.sh p41m0n init
./scripts/tf.sh p41m0n plan -no-color > /tmp/p41m0n-post-toggle.plan
```

**Expected:** identical resource-set to `/tmp/p41m0n-pre-toggle.plan`. The plan output will still show the ~43 add / 8 change / 4 destroy baseline — that's the pre-existing drift, NOT something this PR introduced.

- [ ] **Step 4: Diff the pre/post plans**

```bash
diff <(sed -n '/Terraform will perform/,/^Plan:/p' /tmp/p41m0n-pre-toggle.plan | rg "^  # " | sort -u) \
     <(sed -n '/Terraform will perform/,/^Plan:/p' /tmp/p41m0n-post-toggle.plan | rg "^  # " | sort -u)
```

**Expected:** empty output (the set of resources Terraform wants to operate on is identical).

If the diff shows any added or removed resource line: STOP. The toggle PR introduced (or removed) a resource from p41m0n's plan, which means a `count` gate is wrong or a `moved` block is missing/misdirected. Investigate before opening the PR.

- [ ] **Step 5: Same diff for millsymills (sanity check)**

```bash
diff <(sed -n '/Terraform will perform/,/^Plan:/p' /tmp/mills-pre-toggle.plan | rg "^  # " | sort -u) \
     <(sed -n '/Terraform will perform/,/^Plan:/p' /tmp/mills-post-toggle.plan | rg "^  # " | sort -u)
```

**Expected:** empty output. Millsymills had a clean pre-toggle plan; the post-toggle plan should also be clean.

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin infra/p41m0n-teardown-toggles
gh pr create --base main --title "infra(toggles): add per-feature enable_* toggles for the p41m0n teardown" --body "$(cat <<'EOF'
## Summary

- Adds nine `enable_*` boolean variables and one `cloudfront_headers_profile` string variable to `infra/variables.tf`, all defaulting to `true` / `"strict"` so the millsymills stack is unaffected.
- Gates resources in `inspector_tls.tf`, `csp_report.tf`, `webauthn_demo.tf`, `ct_monitor.tf`, `s3.tf` (logs bucket + s3_bucket_logging), `cloudfront_logging.tf`, `github_oidc.tf` (deploy role only — provider stays), `mta_sts.tf` (A/AAAA aliases), `email.tf` (BIMI) behind their respective toggles, with paired `moved` blocks so existing state addresses survive the refactor.
- Reshapes `infra/acm.tf` to compact the SAN list around `enable_mta_sts_alias`.
- Reshapes `infra/cloudfront.tf` to use `dynamic` blocks for the Lambda origins, the two `/api/*` cache behaviors, and the index-rewrite `function_association`; `compact()` for `aliases`; and a conditional `response_headers_policy_id` that selects between the existing strict policy and a new minimal policy (HSTS + nosniff + frame-options + Referrer-Policy only).
- Does NOT change any tfvars; the p41m0n.tfvars flip happens in a follow-up apply phase.

## Test plan
- [x] `terraform fmt` clean
- [x] `terraform validate` passes
- [x] `tf.sh millsymills plan` empty (matches pre-toggle baseline)
- [x] `tf.sh p41m0n plan` resource-set identical to pre-toggle baseline (p41m0n carries ~43/8/4 pre-existing drift unrelated to this PR — diff-of-plans confirms no new delta introduced; cleared by tfvars flip in Phase 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for CI green and merge before starting Phase 2.

---

## Phase 2 — Cleanup PR (millsymills.com): remove rehearsal-only Astro/script/CI surface

**Branch off latest `main` after the toggle PR merges.** Name suggestion: `chore/p41m0n-rehearsal-cleanup`.

### Task 2.1: Delete the rehearsal deploy workflow

**Files:**
- Delete: `/Users/mills/Desktop/Projects/millsymills.com/.github/workflows/deploy-rehearsal.yml`

- [ ] **Step 1: Delete the file**

```bash
git rm .github/workflows/deploy-rehearsal.yml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(ci): delete deploy-rehearsal.yml (p41m0n teardown)"
```

### Task 2.2: Delete the leakage-assert + verify-p41m0n scripts

**Files:**
- Delete: `/Users/mills/Desktop/Projects/millsymills.com/scripts/verify-p41m0n.sh`
- Delete: `/Users/mills/Desktop/Projects/millsymills.com/scripts/assert-no-rehearsal-leakage.sh`
- Delete: `/Users/mills/Desktop/Projects/millsymills.com/scripts/assert-no-url-leakage.sh`

- [ ] **Step 1: Delete the three scripts**

```bash
git rm scripts/verify-p41m0n.sh scripts/assert-no-rehearsal-leakage.sh scripts/assert-no-url-leakage.sh
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(scripts): delete rehearsal leakage asserts + verify-p41m0n.sh"
```

### Task 2.3: Remove the leakage-assert steps from `ci.yml`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/.github/workflows/ci.yml:125-131`

- [ ] **Step 1: Delete lines 125-131**

Delete the comment block and both steps:

```yaml
      # The two leakage scripts re-build internally with the opposite
      # SITE_URL, so they're independent of the dist/ produced above.
      - name: Assert no URL leakage (rehearsal direction)
        run: ./scripts/assert-no-url-leakage.sh

      - name: Assert no rehearsal URL leakage (prod direction)
        run: ./scripts/assert-no-rehearsal-leakage.sh
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(ci): drop rehearsal leakage assert steps"
```

### Task 2.4: Remove `SITE_URL` env vars from `ci.yml` typecheck/build/e2e steps

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/.github/workflows/ci.yml:82-110`

- [ ] **Step 1: Drop `env: SITE_URL: ...` from three steps**

In the Typecheck step (around line 82-90), delete the `env:` block — the comment and the env value:

```yaml
        env:
          # Hardcoded rather than ${{ vars.SITE_URL }} — ci.yml only
          # typechecks + builds (artifacts are never deployed), the
          # site domain is public, and a missing repo variable would
          # silently fail astro.config.mjs's CI=true SITE_URL guard.
          # Real deploys still resolve SITE_URL per-environment via
          # deploy.yml / deploy-rehearsal.yml.
          SITE_URL: https://millsymills.com
```

In the Build step (around line 92-95), delete:

```yaml
        env:
          SITE_URL: https://millsymills.com
```

In the Playwright e2e step (around line 102-110), delete:

```yaml
        env:
          # Deep-link suite drives the prebuilt dist/ via `astro preview`,
          # so it runs after Build. Playwright's webServer block boots
          # preview on 127.0.0.1:4321 for the duration of the run.
          # astro preview reloads astro.config.mjs, whose CI=true guard
          # demands SITE_URL — same hardcoded value as Typecheck/Build.
          SITE_URL: https://millsymills.com
```

(The trailing comment `# astro preview reloads astro.config.mjs, whose CI=true guard demands SITE_URL — same hardcoded value as Typecheck/Build.` becomes stale once `astro.config.mjs` no longer reads SITE_URL — Task 2.5 removes that guard.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(ci): drop SITE_URL env vars from typecheck/build/e2e steps"
```

### Task 2.5: Revert SITE_URL/NO_INDEX plumbing in `astro.config.mjs`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/astro.config.mjs:120-184`

- [ ] **Step 1: Replace the env-driven `siteUrl` + `noIndex` reads**

Lines 120-140 currently:

```javascript
const siteUrl = process.env.SITE_URL ?? 'https://millsymills.com';
const noIndex = process.env.NO_INDEX === 'true';

// Footgun guards — fail the build rather than deploy wrong.
try {
	new URL(siteUrl);
} catch {
	throw new Error(`astro.config: SITE_URL is not a valid URL: ${siteUrl}`);
}

if (noIndex && siteUrl.includes('millsymills.com')) {
	throw new Error(
		`astro.config: refusing to build with NO_INDEX=true and SITE_URL pointing at millsymills.com (${siteUrl}). This combination would ship a noindexed build to the production domain.`,
	);
}

if (process.env.CI === 'true' && !process.env.SITE_URL) {
	throw new Error(
		'astro.config: SITE_URL must be set in CI builds. Local dev defaults to https://millsymills.com.',
	);
}
```

Delete all of lines 120-140 (the two `const` declarations, the URL guard, the NO_INDEX/millsymills cross-check, the CI-mandatory-SITE_URL guard).

- [ ] **Step 2: Update the `defineConfig` call**

Around line 168-170, change:

```javascript
export default defineConfig({
	output: 'static',
	site: siteUrl,
```

to:

```javascript
export default defineConfig({
	output: 'static',
	site: 'https://millsymills.com',
```

- [ ] **Step 3: Drop the `NO_INDEX` `vite.define` injection**

Around line 173, delete:

```javascript
'import.meta.env.NO_INDEX': JSON.stringify(noIndex ? 'true' : 'false'),
```

Leave the other `vite.define` entries (`PUBLIC_GIT_SHA`, `PUBLIC_GIT_LOG`, `PUBLIC_MAIL_POW`, `PUBLIC_VSCODE_HIGHLIGHTS`) intact.

- [ ] **Step 4: Verify the file still parses**

```bash
node --check astro.config.mjs
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs
git commit -m "chore(astro): drop SITE_URL/NO_INDEX env plumbing (rehearsal-only)"
```

### Task 2.6: Revert `Astro.site`-driven URL emission to hardcoded `https://millsymills.com`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/layouts/BaseLayout.astro`
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/layouts/DesktopLayout.astro`
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/pages/index.astro`
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/pages/[app].astro`
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/pages/sitemap.xml.ts`

For each file: locate every URL emission that currently uses `Astro.site` (or `Astro.url` for pathnames combined with `Astro.site` for canonical URLs) and revert to the original hardcoded `https://millsymills.com` form. Also remove any `import.meta.env.NO_INDEX === 'true'` checks that emit a `<meta name="robots" content="noindex,nofollow">` (the per-page `noindex` prop on BaseLayout stays, since it's used by `404.astro` and other genuinely non-indexable pages).

- [ ] **Step 1: Read each file's current state and identify the emission sites**

```bash
rg -n "Astro\.site|import\.meta\.env\.NO_INDEX" src/layouts/BaseLayout.astro src/layouts/DesktopLayout.astro src/pages/index.astro src/pages/[app].astro src/pages/sitemap.xml.ts
```

Capture the line numbers and patterns. For each match, the original (pre-rehearsal) form was a hardcoded `https://millsymills.com` literal — typically:
- `<link rel="canonical" href={\`https://millsymills.com${Astro.url.pathname}\`} />` → `<link rel="canonical" href={\`https://millsymills.com${Astro.url.pathname}\`} />` (the `Astro.url.pathname` half is fine; only the host literal needs to be hardcoded — confirm in each file)
- `og:url` content attribute → hardcoded host + page path
- `og:image` content attribute → hardcoded host + image path
- JSON-LD `@id` and `url` properties → hardcoded host
- `sitemap.xml.ts`: the `SITE` constant (originally `'https://millsymills.com'`) was replaced with `Astro.site?.href.replace(/\/$/, '')`. Revert to:
  ```typescript
  const SITE = 'https://millsymills.com';
  ```
  and remove the `if (!Astro.site) throw new Error(...)` guard if present.

- [ ] **Step 2: Apply the edits in each file**

Walk each file and apply the revert. Use `git diff origin/main -- <file>` against a known pre-rehearsal commit (the rehearsal landing PR is referenced in `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`) as a reference for the original form. Any file whose pre-rehearsal form is non-obvious: prefer the hardcoded literal over re-deriving from `Astro.site`.

- [ ] **Step 3: Remove `import.meta.env.NO_INDEX` checks from BaseLayout and DesktopLayout**

In `BaseLayout.astro`, find the block that emits `<meta name="robots" content="noindex,nofollow">` gated on `import.meta.env.NO_INDEX === 'true'` (typically alongside the per-page `noindex` prop check) and remove the env check, leaving only the per-page `noindex` prop path:

Before (illustrative — confirm exact form in the file):
```astro
{ (noindex || import.meta.env.NO_INDEX === 'true') && <meta name="robots" content="noindex,nofollow"> }
```

After:
```astro
{ noindex && <meta name="robots" content="noindex,nofollow"> }
```

In `DesktopLayout.astro`, the dress-rehearsal added a robots meta gated solely on `import.meta.env.NO_INDEX === 'true'` (DesktopLayout had no per-page `noindex` prop pre-rehearsal). Delete that block entirely — DesktopLayout returns to having no robots meta.

- [ ] **Step 4: Build to verify everything still resolves**

```bash
npm run build
```

Expected: build succeeds; `dist/` contains the millsymills.com URLs.

- [ ] **Step 5: Spot-check `dist/`**

```bash
rg -l "p41m0n\.com|NO_INDEX|noindex,nofollow" dist/
```

Expected: no `p41m0n.com` matches anywhere; no stray `NO_INDEX` references; `noindex,nofollow` only appears on pages that genuinely opt in via the per-page `noindex` prop (404, etc.).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro src/layouts/DesktopLayout.astro src/pages/index.astro src/pages/\[app\].astro src/pages/sitemap.xml.ts
git commit -m "chore(astro): revert URL emission to hardcoded millsymills.com"
```

### Task 2.7: Atomic robots.txt swap (delete `src/pages/robots.txt.ts` AND restore `public/robots.txt`)

**Files:**
- Delete: `/Users/mills/Desktop/Projects/millsymills.com/src/pages/robots.txt.ts`
- Create: `/Users/mills/Desktop/Projects/millsymills.com/public/robots.txt`

**This must be a single atomic commit.** Astro errors on duplicate route handlers if both files exist simultaneously even briefly in the working tree at commit time.

- [ ] **Step 1: In one staging step, delete the dynamic handler AND write the static file**

```bash
git rm src/pages/robots.txt.ts
```

Then create `public/robots.txt` with the permissive body — extracted verbatim from the `PERMISSIVE_BODY` constant in the deleted file (`src/pages/robots.txt.ts:3-53`), with the `${sitemapUrl}` interpolation replaced by the hardcoded `https://millsymills.com/sitemap.xml`:

```
# robots.txt — millsymills.com
#
# This site is released under MIT and is explicitly friendly to both
# search crawlers and AI agents. Indexing, summarizing, and training
# are all welcome. Agents looking for a fast path to the content:
#
#   /llms.txt       — summary + key links, markdown
#   /llms-full.txt  — full site content serialized as markdown
#   /files/resume.md — machine-readable resume
#   /sitemap.xml    — every page

User-agent: *
Allow: /
Disallow: /super-secret/

# Cloudflare Content Signals — consent for search + AI training
Content-Signal: search=yes, ai-input=yes, ai-train=yes

# Explicit per-bot welcomes so nobody has to guess
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: https://millsymills.com/sitemap.xml
```

- [ ] **Step 2: Stage both changes together**

```bash
git add public/robots.txt
git status --short
```

Expected output (both changes staged in the same commit):
```
A  public/robots.txt
D  src/pages/robots.txt.ts
```

- [ ] **Step 3: Build to confirm Astro is happy with the swap**

```bash
npm run build
```

Expected: build succeeds, `dist/robots.txt` matches `public/robots.txt`.

```bash
diff -u public/robots.txt dist/robots.txt
```

Expected: no diff.

- [ ] **Step 4: Commit (atomic)**

```bash
git commit -m "chore(astro): swap robots.txt back to public/ static file"
```

### Task 2.8: Update `src/data/security-controls.ts` (5 explicit edits)

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/src/data/security-controls.ts`

- [ ] **Step 1: Edit line 260 (`mta-sts` control's `code` array AND `tradeoffs`)**

Locate the control with `id: 'mta-sts'` (around line 253). Two changes within this control:

(a) In the `code` array (line 260), remove `'infra/stacks/p41m0n.tfvars'`. Before:

```typescript
code: ['infra/mta_sts.tf', 'infra/stacks/millsymills.tfvars', 'infra/stacks/p41m0n.tfvars', 'src/pages/.well-known/mta-sts.txt.ts'],
```

After:

```typescript
code: ['infra/mta_sts.tf', 'infra/stacks/millsymills.tfvars', 'src/pages/.well-known/mta-sts.txt.ts'],
```

(b) In the `tradeoffs` field (line 259), find the substring `'on both stacks'` and replace with `'on millsymills.com (the only stack with MTA-STS enabled after the p41m0n teardown)'`. The full sentence becomes:

```
Currently in `mode: testing` (`max_age: 86400`) on millsymills.com (the only stack with MTA-STS enabled after the p41m0n teardown): senders log policy mismatches via TLS-RPT but still deliver, so the rollout is reversible.
```

- [ ] **Step 2: Edit line 279 (`oidc-deploy` control's `what` text)**

In the `what` field of the control with `id: 'oidc-deploy'`, change:

```
the specific workflow file (`deploy.yml` / `deploy-rehearsal.yml`) via `job_workflow_ref`.
```

to:

```
the specific workflow file (`deploy.yml`) via `job_workflow_ref`.
```

- [ ] **Step 3: Edit line 305 (`slsa-cosign` control's `code` array)**

In the `code` array of the control with `id: 'slsa-cosign'`, remove the line `'.github/workflows/deploy-rehearsal.yml',`. Before:

```typescript
code: [
    '.github/workflows/deploy.yml',
    '.github/workflows/deploy-rehearsal.yml',
],
```

After:

```typescript
code: [
    '.github/workflows/deploy.yml',
],
```

- [ ] **Step 4: Edit line 316 (`s3-tls-only` control's `tradeoffs`)**

In the `tradeoffs` field of the control with `id: 's3-tls-only'`, change:

```
Same posture applies to the rehearsal stack — both `tf.sh millsymills` and `tf.sh p41m0n` plans must show the bucket-policy update before merging changes here.
```

to:

```
Same posture applies to both stacks — `tf.sh millsymills` and `tf.sh p41m0n` plans must both show the bucket-policy update before merging changes here.
```

- [ ] **Step 5: Confirm line 229 (`dkim` control's `code`) is left alone**

The `code` array on the `dkim` control includes `'infra/stacks/p41m0n.tfvars'` because the Proton DKIM selectors stay in p41m0n's tfvars after teardown. This entry is still factually accurate. No change.

- [ ] **Step 6: Run `assert-security-controls-paths.sh` locally**

```bash
./scripts/assert-security-controls-paths.sh
```

Expected: no output (all `code` paths resolve to existing files). If it errors with a missing path, double-check that you removed `'.github/workflows/deploy-rehearsal.yml'` from line 305 (Task 2.1 deleted that file).

- [ ] **Step 7: Commit**

```bash
git add src/data/security-controls.ts
git commit -m "chore(security-controls): drop rehearsal/deploy-rehearsal references"
```

### Task 2.9: Remove p41m0n entries from `infra/inspector_tls.mjs` ALLOWED_ORIGINS

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/inspector_tls.mjs`

- [ ] **Step 1: Locate ALLOWED_ORIGINS**

```bash
rg -n "ALLOWED_ORIGINS|p41m0n" infra/inspector_tls.mjs
```

- [ ] **Step 2: Remove the two p41m0n entries**

Find:

```javascript
'https://p41m0n.com',
'https://www.p41m0n.com',
```

(or however they're formatted in the array — single-quoted strings, possibly with trailing commas) and delete both lines.

- [ ] **Step 3: Sanity check the file still parses**

```bash
node --check infra/inspector_tls.mjs
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add infra/inspector_tls.mjs
git commit -m "chore(inspector_tls): drop p41m0n.com from CORS allowlist (teardown)"
```

Note for the PR description: this only takes effect on the next millsymills inspector_tls Lambda re-deploy (when its `source_code_hash` changes). Cosmetic delay only.

### Task 2.10: Reword the p41m0n-naming comments in `infra/cloudfront.tf`

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/cloudfront.tf`

- [ ] **Step 1: Find the p41m0n mentions**

```bash
rg -n "p41m0n" infra/cloudfront.tf
```

Expected matches around:
- Line ~174-182 (`aws_cloudfront_response_headers_policy.api` comment about CORP `cross-origin`)
- Line ~209-216 (`aws_cloudfront_origin_request_policy.csp_report` and `aws_lambda_permission.csp_report_cloudfront` comments)

- [ ] **Step 2: Reword each occurrence**

Replace phrases like `"the \`p41m0n.com\` rehearsal stack"` with `"any future cross-origin caller (none currently)"`. Keep the actual CORP `cross-origin` value unchanged — the comment is the only thing changing.

Example: in the `aws_cloudfront_response_headers_policy.api` comment block, the line:

```
   2. CSP is a document directive — browsers ignore it on `application/json`.
```

is unrelated to p41m0n and stays. The line referencing `p41m0n.com` (something like `"an allowlisted cross-origin caller (e.g. \`p41m0n.com\` — see ALLOWED_ORIGINS in inspector_tls.mjs)"`) becomes `"an allowlisted cross-origin caller (none currently — see ALLOWED_ORIGINS in inspector_tls.mjs for the live allowlist)"`.

- [ ] **Step 3: Confirm no `p41m0n` references remain**

```bash
rg -n "p41m0n" infra/cloudfront.tf
```

Expected: no matches.

- [ ] **Step 4: `terraform fmt` + `validate`**

```bash
terraform -chdir=infra fmt
terraform -chdir=infra validate
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add infra/cloudfront.tf
git commit -m "chore(cloudfront): reword p41m0n-naming CORP comments"
```

### Task 2.11: Verify the cleanup PR introduces no new drift + CI passes

**Files:** none (verification only).

The cleanup PR is source-only (deleting workflows, scripts, reverting Astro plumbing) — it touches no Terraform code. So both stacks should diff identically pre/post cleanup. Same caveat as Task 1.13: p41m0n carries pre-existing drift that's NOT this PR's responsibility.

- [ ] **Step 1: Plan both stacks (interleave init+plan per stack — the tf.sh stale-state guard refuses cross-stack plans)**

```bash
./scripts/tf.sh millsymills init && ./scripts/tf.sh millsymills plan
./scripts/tf.sh p41m0n init && ./scripts/tf.sh p41m0n plan
```

**Expected:** identical resource-set as before the cleanup PR. Millsymills: `No changes` (matches pre-cleanup baseline). p41m0n: still ~43 add / 8 change / 4 destroy (the same pre-existing drift carried through; resolved later when Phase 4's tfvars flip happens).

If the cleanup PR introduced any Terraform plan delta in either stack, that's a bug — the cleanup is supposed to be source-only. Investigate before continuing.

- [ ] **Step 2: Run the local CI mirror**

```bash
./scripts/ci-local.sh
```

Expected: all gates pass. The `assert-security-controls-paths.sh` check is the most likely failure mode here — if it fails, re-check Task 2.8's edits.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin chore/p41m0n-rehearsal-cleanup
gh pr create --base main --title "chore: remove p41m0n rehearsal-only Astro/script/CI surface" --body "$(cat <<'EOF'
## Summary

- Deletes the `deploy-rehearsal.yml` workflow, the `verify-p41m0n.sh` / `assert-no-rehearsal-leakage.sh` / `assert-no-url-leakage.sh` scripts, and their CI invocations.
- Reverts the `NO_INDEX` / `SITE_URL` Astro plumbing back to a hardcoded `https://millsymills.com` site value in `astro.config.mjs`, `BaseLayout.astro`, `DesktopLayout.astro`, `index.astro`, `[app].astro`, `sitemap.xml.ts`.
- Atomically swaps `src/pages/robots.txt.ts` back to `public/robots.txt` (permissive form).
- Updates `src/data/security-controls.ts` to drop stale rehearsal references (mta-sts code array, oidc-deploy what text, slsa-cosign code array, s3-tls-only tradeoffs).
- Drops `'https://p41m0n.com'` / `'https://www.p41m0n.com'` from the `inspector_tls.mjs` CORS allowlist (effective on next millsymills inspector_tls Lambda redeploy).
- Rewords the `p41m0n.com`-naming comments in `infra/cloudfront.tf` (CORP `cross-origin` value unchanged).

## Followup (manual)

After this PR merges, delete the `rehearsal` GitHub Environment:

```bash
gh api -X DELETE repos/millsmillsymills/millsymills.com/environments/rehearsal
```

## Test plan
- [x] `tf.sh millsymills plan` empty (matches pre-cleanup baseline)
- [x] `tf.sh p41m0n plan` resource-set identical to pre-cleanup baseline (this PR is source-only; no Terraform impact expected. p41m0n's pre-existing ~43/8/4 drift carries through and is resolved in Phase 4 by the tfvars flip.)
- [x] `./scripts/ci-local.sh` clean (including `assert-security-controls-paths.sh`)
- [x] `npm run build` produces a `dist/` with no `p41m0n.com` references and a permissive `dist/robots.txt`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for CI green and merge before starting Phase 3.

### Task 2.12: After cleanup PR merges, delete the `rehearsal` GitHub Environment

**Files:** none (gh CLI operation).

- [ ] **Step 1: Confirm the env exists**

```bash
gh api repos/millsmillsymills/millsymills.com/environments | jq -r '.environments[].name'
```

Expected output includes `rehearsal` (and `production`).

- [ ] **Step 2: Delete it**

```bash
gh api -X DELETE repos/millsmillsymills/millsymills.com/environments/rehearsal
```

Expected: HTTP 204 (no body).

- [ ] **Step 3: Verify deletion**

```bash
gh api repos/millsmillsymills/millsymills.com/environments | jq -r '.environments[].name'
```

Expected: only `production` (and any other live envs); `rehearsal` is gone.

---

## Phase 3 — Content PR (p41m0n.com): add the meme + HTML wrapper

**In the `p41m0n.com` repo, branch off `main`.** Name suggestion: `feat/static-image-content`.

### Task 3.1: Generate the EXIF-stripped JPEG

**Files:**
- Create: `/Users/mills/Desktop/Projects/p41m0n.com/face-of-mercy.jpg`

- [ ] **Step 1: Verify ImageMagick is installed**

```bash
magick -version | head -1
```

Expected: `Version: ImageMagick 7.x.x ...` or similar.

If missing: `brew install imagemagick`.

- [ ] **Step 2: Generate the file**

```bash
cd /Users/mills/Desktop/Projects/p41m0n.com
magick ~/Downloads/IMG_0220_Original.jpg -auto-orient -strip -quality 85 face-of-mercy.jpg
```

`-auto-orient` rotates the image based on the EXIF orientation tag BEFORE stripping (so the stripped output is correctly oriented). `-strip` removes all EXIF/IPTC/XMP. `-quality 85` re-encodes at JPEG quality 85.

Expected: file created, no errors. Original is ~2 MB; output should be ~300-600 KB.

- [ ] **Step 3: Verify EXIF is gone**

```bash
exiftool face-of-mercy.jpg
```

Expected output should look roughly like (the exact lines vary by ImageMagick version, but no `Make`, `Model`, `GPS-Data`, `DateTime`, `Software` etc. should appear):

```
ExifTool Version Number   : 12.x
File Name                 : face-of-mercy.jpg
Directory                 : .
File Size                 : ...
File Modification Date/Time : ...
File Type                 : JPEG
File Type Extension       : jpg
MIME Type                 : image/jpeg
JFIF Version              : 1.01
Resolution Unit           : ...
X Resolution              : ...
Y Resolution              : ...
Image Width               : 2448
Image Height              : 2454
Encoding Process          : Baseline DCT, Huffman coding
Bits Per Sample           : 8
Color Components          : 3
Y Cb Cr Sub Sampling      : YCbCr4:2:0 (2 2)
```

If `Make`, `Model`, `GPS-Data`, or any `EXIF` group fields appear: re-run the `magick` command — `-strip` should have removed them.

- [ ] **Step 4: Eyeball the image**

```bash
open face-of-mercy.jpg  # macOS
```

Expected: meme renders, oriented correctly (face is upright).

### Task 3.2: Create the HTML wrapper

**Files:**
- Create: `/Users/mills/Desktop/Projects/p41m0n.com/index.html`

- [ ] **Step 1: Write the file**

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>p41m0n.com</title>
  <style>
    html,body{margin:0;background:#000;height:100%;display:flex;align-items:center;justify-content:center}
    img{max-width:100%;max-height:100vh;display:block}
  </style>
  <img src="/face-of-mercy.jpg" alt="The face of mercy">
</html>
```

- [ ] **Step 2: Verify it parses**

```bash
node --check index.html 2>/dev/null || true  # node can't parse HTML; this is a no-op sanity step
```

Better: open it in a browser locally:

```bash
python3 -m http.server 8000 &
SERVER=$!
open http://localhost:8000/
sleep 5
kill $SERVER
```

Expected: meme on a black background, centered, scaled to fit the viewport.

### Task 3.3: Commit and open the PR

- [ ] **Step 1: Stage both files**

```bash
cd /Users/mills/Desktop/Projects/p41m0n.com
git add index.html face-of-mercy.jpg
git status --short
```

Expected:
```
A  face-of-mercy.jpg
A  index.html
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add static image content (face of mercy meme)

Replaces the rehearsal Astro build that previously served at
p41m0n.com. The meme JPEG is EXIF-stripped (q85), the HTML wrapper is
a tiny no-JS page that centers the image on a black background.

Per docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md
in millsymills.com.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/static-image-content
gh pr create --base main --title "feat: add static image content (face of mercy meme)" --body "$(cat <<'EOF'
## Summary

- Adds `face-of-mercy.jpg` (EXIF-stripped, q85) and a tiny HTML wrapper to be served at https://p41m0n.com/.
- Per `docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md` in `millsymills.com`.

## Test plan
- [x] `exiftool face-of-mercy.jpg` shows no EXIF beyond JFIF basics
- [x] `python3 -m http.server` + browser load renders the meme on a black background

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge the content PR before starting Phase 4 (the apply phase reads files from the merged main).

---

## Phase 4 — Apply (operator, from `millsymills.com` checkout)

All three millsymills.com PRs (pre-step, toggle, cleanup) and the p41m0n.com content PR must be merged to main before starting this phase.

### Task 4.1: Update `infra/stacks/p41m0n.tfvars` to the final shape

**Files:**
- Modify: `/Users/mills/Desktop/Projects/millsymills.com/infra/stacks/p41m0n.tfvars`

- [ ] **Step 1: Replace the file contents**

Full new content of `infra/stacks/p41m0n.tfvars`:

```hcl
aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# deploy_workflow / deploy_environment removed — no GH deploy workflow
# for the slimmed stack (see enable_github_deploy_role = false). The CI
# gate in ci.yml that asserts per-stack deploy_workflow files exist
# falls back to deploy.yml when the var is absent (which exists for
# millsymills), so the assertion still passes.

# All heavyweight features off — see
# docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md.
enable_inspector_tls      = false
enable_csp_report         = false
enable_webauthn_demo      = false
enable_ct_monitor         = false
enable_access_logging     = false
enable_github_deploy_role = false
enable_index_rewrite      = false
enable_mta_sts_alias      = false
enable_bimi               = false

# Headers profile: minimal — single-image static site.
cloudfront_headers_profile = "minimal"

# Mail: Proton catchall stays. Verification token at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets are exactly as today — Proton uses fixed selector names and
# infra/email.tf builds <selector>._domainkey.<domain> from the keys.
protonmail_dkim_selectors = {
  protonmail  = "protonmail.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail2 = "protonmail2.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail3 = "protonmail3.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
}
```

Removed lines vs. previous: `deploy_workflow`, `deploy_environment`, `ct_monitor_alert_address`, `enable_mta_sts`, `mta_sts_id`. Added: nine `enable_*` lines and `cloudfront_headers_profile`.

> **MTA-STS reversal note.** Dropping `enable_mta_sts` straight to `false` is only safe here because p41m0n is currently in `mode: testing` — senders that cached the policy will log a TLS-RPT mismatch but still deliver. A `mode: enforce` reversal would require the two-step described in CLAUDE.md: publish `mode: none` in `src/pages/.well-known/mta-sts.txt.ts`, bump `mta_sts_id`, deploy, **wait `max_age`**, and only THEN flip `enable_mta_sts` to `false`. Future-you reading this for a different stack: don't copy this skip without checking the current mode.

- [ ] **Step 2: `terraform fmt`**

```bash
terraform -chdir=infra fmt infra/stacks/p41m0n.tfvars
```

Expected: clean.

### Task 4.2: Re-init p41m0n stack

- [ ] **Step 1: Init**

```bash
./scripts/tf.sh p41m0n init -reconfigure
```

Expected: `Terraform has been successfully initialized!`

### Task 4.3: Plan and review

- [ ] **Step 1: Plan**

```bash
./scripts/tf.sh p41m0n plan -out=p41m0n-teardown.plan
```

- [ ] **Step 2: Review the plan against the expected destroys / creates / updates**

Use the Spec § Apply phase step 3 list (in `docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md`) as the contract. **Note:** the spec was amended on 2026-05-15 after a `state list` audit revealed that csp_report, webauthn_demo, and MTA-STS were never deployed to p41m0n — so they're NOT in the destroy list. There is also NO cert replacement (deployed cert already has the 2 SANs the toggle PR wants).

Cross-check each line of plan output against:

- **Destroys (~36 resources, all currently in p41m0n state):**
  - **inspector_tls (9):** `aws_lambda_function.inspector_tls`, `aws_iam_role.inspector_tls`, `aws_iam_role_policy_attachment.inspector_tls_basic`, `aws_cloudwatch_log_group.inspector_tls`, `aws_lambda_function_url.inspector_tls`, `aws_lambda_permission.inspector_tls_cloudfront`, `aws_cloudfront_origin_access_control.inspector_tls`, `aws_cloudfront_origin_request_policy.inspector_tls`, `aws_cloudfront_response_headers_policy.api`.
  - **ct_monitor (10):** `aws_lambda_function.ct_monitor`, `aws_iam_role.ct_monitor`, `aws_iam_role_policy_attachment.ct_monitor_basic`, `aws_iam_role_policy.ct_monitor_publish`, `aws_cloudwatch_log_group.ct_monitor`, `aws_sns_topic.ct_monitor`, `aws_sns_topic_subscription.ct_monitor_email`, `aws_cloudwatch_event_rule.ct_monitor`, `aws_cloudwatch_event_target.ct_monitor`, `aws_lambda_permission.ct_monitor_eventbridge`.
  - **github_deploy role (2):** `aws_iam_role.github_deploy`, `aws_iam_role_policy.github_deploy`. **NOT** `aws_iam_openid_connect_provider.github`.
  - **index rewrite (1):** `aws_cloudfront_function.index_rewrite`.
  - **BIMI (1):** `aws_route53_record.bimi`.
  - **Access logging (12):** `aws_s3_bucket.logs` + 7 supporting (`public_access_block`, `ownership_controls`, `server_side_encryption_configuration`, `versioning`, `lifecycle_configuration`, `policy`), `aws_s3_bucket_logging.site`, plus 3 `cloudfront_logging` resources (`source`, `destination`, `delivery`).
  - **Strict response-headers policy (1):** `aws_cloudfront_response_headers_policy.site` (count goes 1→0 because `cloudfront_headers_profile=minimal`; replaced by `site_minimal` per Create below).

- **Create (1):** `aws_cloudfront_response_headers_policy.site_minimal`.

- **Update in-place (1):** `aws_cloudfront_distribution.site` (Lambda origins removed, `/api/*` cache behaviors removed, `function_association` removed, `response_headers_policy_id` swaps to `site_minimal`). The `aliases` attribute already matches the deployed set (apex + www; mta-sts never made it onto the cert/distribution), so no aliases diff.

- **No change (deployed, untouched by this work):**
  - **Cert:** `aws_acm_certificate.site` (already at apex + www; toggle PR's `enable_mta_sts_alias=false` matches deployed state, so no replacement).
  - **Cert validation:** `aws_acm_certificate_validation.site`, `aws_route53_record.cert_validation["p41m0n.com"]`, `aws_route53_record.cert_validation["www.p41m0n.com"]`.
  - **DNS (site):** `aws_route53_record.root_a`/`root_aaaa`/`www_a`/`www_aaaa`.
  - **DNS (email):** `aws_route53_record.mx`, `apex_txt`, `dkim["protonmail"]` + `["protonmail2"]` + `["protonmail3"]`, `dmarc`, `tlsrpt`.
  - **DNS (other):** `aws_route53_record.caa`.
  - **DNSSEC:** `aws_kms_key.dnssec`, `aws_kms_alias.dnssec`, `aws_route53_key_signing_key.ksk`, `aws_route53_hosted_zone_dnssec.site`.
  - **IAM:** `aws_iam_openid_connect_provider.github` (account-wide; **MUST** survive).
  - **Site delivery:** `aws_s3_bucket.site` + 8 supporting; `aws_cloudfront_origin_access_control.site`.

- **No-op (NOT in state today; toggle PR makes TF not want them either — they disappear from the plan entirely):** csp_report suite (22 resources), webauthn_demo suite (12 resources), MTA-STS A/AAAA/TXT records, `aws_route53_record.cert_validation["mta-sts.p41m0n.com"]`.

**Stop conditions** — if the plan shows ANY of these, do not apply:
- A destroy of `aws_iam_openid_connect_provider.github`. (Means the toggle PR's gating in github_oidc.tf was wrong.)
- A destroy of `aws_s3_bucket.site` or any of its 8 supporting resources. (Means a toggle was wrongly applied to the site bucket.)
- A destroy of `aws_kms_key.dnssec`, `aws_kms_alias.dnssec`, `aws_route53_key_signing_key.ksk`, or `aws_route53_hosted_zone_dnssec.site`. (`prevent_destroy = true` would also block, but seeing it in the plan signals a TF code mistake.)
- Any *create* of csp_report / webauthn_demo / MTA-STS resources. (Means the toggle didn't take effect — re-check `p41m0n.tfvars`.)
- A cert REPLACEMENT (`aws_acm_certificate.site` "must be replaced"). (Means `enable_mta_sts_alias` is still effectively true or the cert's SAN list has drifted.)
- Any create other than `aws_cloudfront_response_headers_policy.site_minimal`.

If the plan looks right: continue to apply. If anything is off, do NOT apply — re-investigate.

### Task 4.4: Apply

- [ ] **Step 1: Apply the saved plan**

```bash
./scripts/tf.sh p41m0n apply p41m0n-teardown.plan
```

Wall-clock expectation: ~10-15 minutes. Dominated entirely by CloudFront distribution propagation (~10-15 min). No ACM cert validation race (cert unchanged), no Lambda cold-start delays (no new Lambdas).

- [ ] **Step 2: Confirm apply complete**

Expected final lines roughly:

```
Apply complete! Resources: <N> added, <N> changed, <N> destroyed.
```

The exact counts will reflect: 1 added (`site_minimal`), 1 changed (CloudFront distro), ~36 destroyed (inspector_tls suite + ct_monitor suite + github_deploy role + index_rewrite + BIMI + logs bucket + supporting + cloudfront_logging + strict response-headers policy). Significantly fewer destroys than originally anticipated because csp_report/webauthn_demo/MTA-STS were never deployed to p41m0n.

- [ ] **Step 3: Capture the CloudFront distribution ID for the upload step**

```bash
DIST_ID=$(./scripts/tf.sh p41m0n output -raw cloudfront_distribution_id)
echo "DIST_ID=$DIST_ID"
```

Expected: a 13-or-14-character distribution ID like `E1XXXXXXXXXXXX`.

### Task 4.5: One-shot upload + invalidate

- [ ] **Step 1: Stage the content from the p41m0n.com checkout**

```bash
P41M0N_REPO=/Users/mills/Desktop/Projects/p41m0n.com
ls "$P41M0N_REPO"/{index.html,face-of-mercy.jpg}
```

Expected: both files present (merged in Phase 3).

- [ ] **Step 2: Upload the HTML**

```bash
aws s3 cp "$P41M0N_REPO/index.html" s3://p41m0n.com/index.html \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public,max-age=300"
```

Expected: `upload: ...index.html to s3://p41m0n.com/index.html`.

- [ ] **Step 3: Upload the JPEG**

```bash
aws s3 cp "$P41M0N_REPO/face-of-mercy.jpg" s3://p41m0n.com/face-of-mercy.jpg \
  --content-type "image/jpeg" \
  --cache-control "public,max-age=86400"
```

Expected: `upload: ...face-of-mercy.jpg to s3://p41m0n.com/face-of-mercy.jpg`.

- [ ] **Step 4: Invalidate CloudFront**

```bash
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

Expected: JSON output with an invalidation ID. Invalidation completes in 1-3 minutes typically.

- [ ] **Step 5: Wait for the invalidation**

```bash
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id <invalidation-id-from-previous-step>
```

(Returns when the invalidation is `Completed`. Or skip and move on — verification will catch stale-cache issues.)

---

## Phase 5 — Verify

### Task 5.1: HTTP / DNS verification

- [ ] **Step 1: Apex serves the meme over HTTPS with HSTS**

```bash
curl -sI https://p41m0n.com/
```

Expected output (key headers):
- `HTTP/2 200`
- `content-type: text/html; charset=utf-8`
- `strict-transport-security: max-age=63072000; includeSubDomains; preload`
- `x-content-type-options: nosniff`
- `x-frame-options: SAMEORIGIN`
- `referrer-policy: strict-origin-when-cross-origin`
- NO `content-security-policy` header (minimal profile drops it)
- NO `cross-origin-opener-policy` header
- NO `permissions-policy` header

- [ ] **Step 2: Raw image serves with correct content-type**

```bash
curl -sI https://p41m0n.com/face-of-mercy.jpg
```

Expected: `HTTP/2 200`, `content-type: image/jpeg`, HSTS present.

- [ ] **Step 3: www alias works**

```bash
curl -sI https://www.p41m0n.com/
```

Expected: same as apex.

- [ ] **Step 4: mta-sts subdomain is gone**

```bash
dig +short A mta-sts.p41m0n.com
dig +short AAAA mta-sts.p41m0n.com
```

Expected: both return empty (NXDOMAIN behavior — no answer).

- [ ] **Step 5: BIMI record is gone**

```bash
dig +short TXT default._bimi.p41m0n.com
```

Expected: empty.

- [ ] **Step 6: Mail DNS still intact**

```bash
dig +short MX p41m0n.com
dig +short TXT p41m0n.com
dig +short TXT _dmarc.p41m0n.com
dig +short TXT _smtp._tls.p41m0n.com
dig +short CNAME protonmail._domainkey.p41m0n.com
```

Expected:
- MX: two Proton MX records (`10 mail.protonmail.ch.`, `20 mailsec.protonmail.ch.`)
- apex TXT: includes `v=spf1 include:_spf.protonmail.ch -all`
- _dmarc: `v=DMARC1; p=reject; ...`
- _smtp._tls: `v=TLSRPTv1; rua=mailto:tls-rpt@p41m0n.com`
- DKIM CNAME: `protonmail.domainkey.dcj2...domains.proton.ch.`

- [ ] **Step 7: Send a test email and verify Proton catchall delivery**

From any sending account:

```
To: test+teardown@p41m0n.com
Subject: p41m0n teardown verification
Body: <anything>
```

Expected: lands in `overm1nd@pm.me` inbox within ~1 minute.

- [ ] **Step 8: Browser smoke test**

Open `https://p41m0n.com/` in a browser. Expected:
- Black background.
- Centered "face of mercy" meme image.
- No console errors (DevTools).
- No failed network requests (DevTools Network tab).
- View source shows the exact HTML committed in Phase 3.

### Task 5.2: AWS state audit

- [ ] **Step 1: OIDC provider survived**

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::${ACCT}:oidc-provider/token.actions.githubusercontent.com" --query 'Url'
```

Expected: `"https://token.actions.githubusercontent.com"` (provider exists).

- [ ] **Step 2: p41m0n deploy role is gone**

```bash
aws iam get-role --role-name p41m0n-com-github-deploy 2>&1 | head -2
```

Expected: `An error occurred (NoSuchEntity) ... cannot be found.`

- [ ] **Step 3: p41m0n logs bucket is gone**

```bash
aws s3 ls s3://p41m0n.com-logs 2>&1 | head -2
```

Expected: `NoSuchBucket` or similar 404 message.

- [ ] **Step 4: p41m0n CSP reports bucket absent (never existed; confirm still absent)**

```bash
aws s3 ls s3://p41m0n.com-csp-reports 2>&1 | head -2
```

Expected: `NoSuchBucket`. (csp_report was never deployed to p41m0n — see spec § Domain and stack state at time of writing. This check confirms the absence; nothing was destroyed in this work.)

- [ ] **Step 5: All p41m0n Lambdas are gone**

```bash
aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'p41m0n-com-')].FunctionName" --output text
```

Expected: empty output. The two deployed Lambdas (`p41m0n-com-inspector-tls`, `p41m0n-com-ct-monitor`) are destroyed by this work; `p41m0n-com-csp-report` and `p41m0n-com-webauthn-demo` never existed.

- [ ] **Step 6: webauthn DynamoDB tables absent (never existed)**

```bash
aws dynamodb list-tables --query "TableNames[?starts_with(@, 'p41m0n-com-')]" --output text
```

Expected: empty output. (`p41m0n-com-webauthn-demo` and `-webauthn-demo-sessions` were never deployed; confirm still absent.)

- [ ] **Step 7: Site bucket is intact**

```bash
aws s3 ls s3://p41m0n.com/
```

Expected:
```
... index.html
... face-of-mercy.jpg
```

- [ ] **Step 8: ACM cert SAN list is unchanged at apex + www only**

```bash
CERT_ARN=$(aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='p41m0n.com'].CertificateArn | [0]" --output text)
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" --query 'Certificate.SubjectAlternativeNames'
```

Expected: `["p41m0n.com", "www.p41m0n.com"]` (no `mta-sts.p41m0n.com`). Note: the deployed cert already had this SAN list before the teardown — the toggle PR doesn't change it (the TF code's previous "want 3 SANs" matched nothing in state; the toggle PR's "want 2 SANs" matches what's deployed).

### Task 5.3: Final acceptance check against spec

- [ ] **Step 1: Walk the spec's § Acceptance criteria**

Open `docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md` § Acceptance criteria. Confirm each of the 8 criteria has been verified above. Note any discrepancies in a follow-up issue.

- [ ] **Step 2: Update the spec's status header** (optional, if desired)

If you want to mark the spec as completed:

```bash
cd /Users/mills/Desktop/Projects/millsymills.com
# Edit the spec header from "Status: approved design, 2026-05-15" to
# "Status: implemented, 2026-05-XX" (use today's date).
git add docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md
git commit -m "docs(specs): mark p41m0n teardown spec implemented"
git push
```

---

## Self-review checklist (run by the implementer before declaring done)

- [ ] Every spec acceptance criterion in § Acceptance criteria has a passing verification step in Phase 5.
- [ ] No `aws_iam_openid_connect_provider.github` operation in any Terraform plan output.
- [ ] No commits straddle multiple unrelated repos (toggle / cleanup / content PRs are independent).
- [ ] The atomic robots.txt swap (Task 2.7) was a single commit, not two.
- [ ] `tf.sh millsymills plan` was empty after each of the three millsymills.com PRs landed independently.
- [ ] `exiftool face-of-mercy.jpg` shows no `EXIF:`, `XMP:`, `IPTC:`, or `MakerNotes:` groups.
- [ ] Send-test email to `test+teardown@p41m0n.com` actually arrived at `overm1nd@pm.me`.
