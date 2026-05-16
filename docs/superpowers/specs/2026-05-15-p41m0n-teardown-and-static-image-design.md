# p41m0n.com teardown of rehearsal stack + static-image hosting

**Status:** approved design, 2026-05-15
**Goal:** retire the elaborate parallel AWS stack that backed `p41m0n.com` as a `millsymills.com` rehearsal target, and replace it with the minimum infrastructure needed to serve a single static image (the "face of mercy" meme) plus the existing Proton catchall mail. Shared resources (Terraform state bucket, Route53 hosted zone, account-wide IAM OIDC provider) are not touched.

## Why

The dress rehearsal (`docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`) and the Proton-mail migration (`docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md`) both deferred tear-down. With `millsymills.com` now live in production, the per-stack heavyweight surface on `p41m0n.com` (inspector_tls Lambda, csp_report Lambda + reports bucket + alarms, webauthn_demo Lambda + DynamoDB tables + alarms, ct_monitor Lambda + SNS, MTA-STS rehearsal, BIMI, CloudFront access-log v2 delivery + the `<domain>-logs` bucket, GitHub OIDC deploy role, the index-rewrite CloudFront Function, the strict CSP/Permissions-Policy/COOP/COEP/CORP response-headers policy) earns nothing. Cost is low but cognitive load is real: every infra change has to be reasoned about against two stacks, and the rehearsal-specific Astro plumbing (`NO_INDEX` / `SITE_URL`, `assert-no-rehearsal-leakage.sh`, `assert-no-url-leakage.sh`, `deploy-rehearsal.yml`, the `rehearsal` GitHub Environment) is dead weight on `millsymills.com` once the rehearsal isn't running.

The new content for `p41m0n.com` is a single static image plus a tiny HTML wrapper. The Proton catchall (`*@p41m0n.com` → `overm1nd@pm.me`) stays — it's free, isolates a sandbox mail surface from millsymills, and the rehearsal already established its DNS plumbing.

## Decisions (locked, made during brainstorming)

1. **Hosting:** minimal AWS — S3 + CloudFront + ACM + Route53. No move off-AWS. Reuses the existing Route53 hosted zone and registrar NS pointing at it.
2. **Mail:** keep Proton catchall and its DKIM/DMARC/TLSRPT DNS. Tear down MTA-STS Phase 1 rehearsal (the `mta-sts.p41m0n.com` CloudFront alias and the `_mta-sts` discovery TXT). Tear down BIMI (no brand mark on a meme domain).
3. **URL shape:** apex serves a tiny HTML wrapper that `<img>`-tags the meme; `/face-of-mercy.jpg` returns the raw image with `image/jpeg` content type so the asset can be hot-linked directly.
4. **Hardening retained:** HSTS + `X-Content-Type-Options` + `X-Frame-Options` + `Referrer-Policy`, plus DNSSEC, plus CAA. Drop strict CSP / Permissions-Policy / COOP / COEP / CORP — overkill for a single-image site with no JS.
5. **Content + CI:** content (the JPEG and `index.html`) lives in the `p41m0n.com` repo. No CI; future image swaps are operator-driven via `aws s3 cp` from local AWS credentials.
6. **Image prep:** EXIF-stripped, dimensions preserved, JPEG q85 re-encode (the source iPhone JPEG embeds a GPS-Data tag).
7. **Cleanup scope:** rehearsal-specific code in `millsymills.com` (Astro `NO_INDEX`/`SITE_URL` plumbing, `deploy-rehearsal.yml`, the `rehearsal` GH Environment, the leakage-assert scripts and their CI invocations, `verify-p41m0n.sh`, the `'https://p41m0n.com'` entries in `inspector_tls.mjs`'s CORS allowlist, the `p41m0n.com`-naming `cross-origin` CORP comment in `cloudfront.tf`, stale references in `src/data/security-controls.ts`) lands in the same coordinated change.
8. **Terraform shape:** add per-feature `enable_*` toggles (matching the existing `enable_mta_sts` pattern), all defaulting to `true` so millsymills is unchanged. `p41m0n.tfvars` flips the unwanted ones to `false`.

## Domain and stack state at time of writing

> **Important correction (2026-05-15, post-PR-#493):** the original write-up of this section assumed p41m0n's deployed state mirrored millsymills's. A `terraform state list` on the p41m0n stack after the spec landed revealed that **p41m0n's deployed state never tracked csp_report, webauthn_demo, MTA-STS, or BIMI** — those features were added to the shared TF code over time but only millsymills was re-applied. p41m0n still carries the slimmer state from the original rehearsal apply. Net result: the teardown destroys a smaller surface than the original spec described, and **no ACM cert replacement happens** (the deployed cert already has 2 SANs — apex + www — matching what the toggle PR wants). The "Apply phase" and "Acceptance criteria" sections below have been amended to reflect the actual state inventory.

- **`p41m0n.com`** registered at Gandi, NS pointed at Route53 (hosted zone `Z08582353GK05ITZ9SORO`), DNSSEC chained via DS at Gandi. CloudFront distribution + S3 site bucket + ACM cert (apex + www SANs — NOT mta-sts) live. Proton catchall active per the 2026-05-01 spec. **MTA-STS NOT deployed on p41m0n** (despite `enable_mta_sts = true` in `infra/stacks/p41m0n.tfvars` — the TF code wants MTA-STS records but p41m0n was never re-applied after the MTA-STS feature landed).
- **Resources actually in p41m0n's Terraform state today** (per `tf.sh p41m0n state list`, sorted by category):
  - **Site delivery:** `aws_s3_bucket.site` + 8 supporting; `aws_cloudfront_origin_access_control.site`; `aws_cloudfront_distribution.site`; `aws_cloudfront_function.index_rewrite`; `aws_cloudfront_response_headers_policy.site`.
  - **inspector_tls (full suite):** Lambda + role + log group + Function URL + OAC + permission + origin-request policy + `aws_cloudfront_response_headers_policy.api`.
  - **ct_monitor (full suite):** Lambda + role + 2 policies + log group + SNS topic + email subscription + EventBridge rule + target + permission.
  - **Access logging:** `aws_s3_bucket.logs` + 7 supporting; `aws_s3_bucket_logging.site`; three `cloudfront_logging` delivery resources.
  - **IAM (deploy):** `aws_iam_role.github_deploy` + policy; `aws_iam_openid_connect_provider.github` (shared with millsymills).
  - **Cert + Route53:** `aws_acm_certificate.site` (apex + www SANs); `aws_acm_certificate_validation.site`; `aws_route53_record.cert_validation["p41m0n.com"]` + `["www.p41m0n.com"]`; `aws_route53_record.root_a`/`root_aaaa`/`www_a`/`www_aaaa`.
  - **Email + DNS:** `aws_route53_record.mx`/`apex_txt`/`dkim` (×3)/`dmarc`/`tlsrpt`/`bimi`/`caa`.
  - **DNSSEC:** `aws_kms_key.dnssec` + alias; `aws_route53_key_signing_key.ksk`; `aws_route53_hosted_zone_dnssec.site`.
- **Resources expected by the TF code today but NOT in p41m0n state** (the toggle PR's `enable_*=false` flips simply prevent these from being created — there's nothing to destroy):
  - **csp_report:** entire suite (Lambda + role + 3 policies + log group + Function URL + OAC + permission + reports S3 bucket + 5 supporting + SNS topic + sub + 3 alarms + 2 metric filters + response-headers policy + origin-request policy) — ~22 resources.
  - **webauthn_demo:** entire suite (Lambda + role + policy + log group + Function URL + 2 DynamoDB tables + 4 alarms + null_resource install + archive) — ~12 resources.
  - **MTA-STS:** `aws_route53_record.mta_sts_a` + `mta_sts_aaaa` + `mta_sts_txt[0]` + `cert_validation["mta-sts.p41m0n.com"]`.
- **Resources kept on the slimmed p41m0n stack:** S3 site bucket (`p41m0n.com`); CloudFront distribution (single S3 origin, no Lambda origins, no `/api/*` cache behaviors); ACM cert (unchanged — already at apex + www only); Route53 ALIAS records (apex + www); email DNS (MX, apex SPF TXT, three DKIM CNAMEs, DMARC, TLSRPT) — Proton catchall stays live; DNSSEC (KMS KSK + Route53 zone-signing config + DS at Gandi); CAA records; a NEW minimal CloudFront response-headers policy (HSTS + nosniff + X-Frame-Options + Referrer-Policy).

## Architecture

One Terraform codebase, two stacks separated only by state — same pattern established by the rehearsal spec. The slimming happens via per-feature toggle variables; nothing is hard-coded into a stack-specific code path.

### Pre-step (separate PR, lands first)

`infra/cloudfront_logging.tf:8` defines `data "aws_caller_identity" "current" {}`, but the data source is referenced from `infra/dnssec.tf:177`, `infra/s3.tf:240`, and `infra/s3.tf:243`. If a later toggle removes or conditionally evaluates `cloudfront_logging.tf`, those references break.

Move the `data "aws_caller_identity" "current" {}` block into `infra/main.tf` (a file no toggle gates). Pure refactor; millsymills plans empty after, p41m0n plan is unchanged from its pre-move baseline (p41m0n carries pre-existing ~43/8/4 drift that's resolved later in Phase 4, not by this move). Lands as its own small PR before the toggle work begins, isolating the move from the larger change.

### Toggle variables

Added to `infra/variables.tf`, all defaulting to `true` so millsymills is unchanged:

```hcl
variable "enable_inspector_tls"      { type = bool; default = true }
variable "enable_csp_report"         { type = bool; default = true }
variable "enable_webauthn_demo"      { type = bool; default = true }
variable "enable_ct_monitor"         { type = bool; default = true }
variable "enable_access_logging"     { type = bool; default = true }
variable "enable_github_deploy_role" { type = bool; default = true }
variable "enable_index_rewrite"      { type = bool; default = true }
variable "enable_mta_sts_alias"      { type = bool; default = true }
variable "enable_bimi"               { type = bool; default = true }
variable "cloudfront_headers_profile" {
  type    = string
  default = "strict"
  validation {
    condition     = contains(["strict", "minimal"], var.cloudfront_headers_profile)
    error_message = "cloudfront_headers_profile must be \"strict\" or \"minimal\"."
  }
}
```

Each toggle's gating contract:

- **`enable_inspector_tls`** — gates everything in `infra/inspector_tls.tf` (Lambda, IAM role, log group, Function URL, OAC, locals). In `infra/cloudfront.tf`: the `inspector_tls` `origin` block, the `/api/tls/*` `ordered_cache_behavior`, the `aws_cloudfront_origin_request_policy.inspector_tls`, and the `aws_cloudfront_response_headers_policy.api` (which exists only to serve this cache behavior) all gate on this flag via `dynamic` blocks (`for_each = var.enable_inspector_tls ? [1] : []`) for the block resources, and via `count = var.enable_inspector_tls ? 1 : 0` for the standalone resources.

- **`enable_csp_report`** — gates everything in `infra/csp_report.tf`: Lambda + IAM role + inline policies + log group + Function URL + OAC + the dedicated `aws_cloudfront_response_headers_policy.csp_report`; the reports bucket and its 7 supporting resources (PAB, ownership, SSE, lifecycle, policy); the `csp_report_ops` SNS topic + email subscription; the three CloudWatch alarms (`throttles`, `put_failed`, `body_cap_exceeded`) and their two metric filters (`put_failed`, `body_cap_exceeded`). In `infra/cloudfront.tf`: the `csp_report` `origin` block, the `/api/csp-report` `ordered_cache_behavior`, and the `aws_cloudfront_origin_request_policy.csp_report`. ALSO required: when `enable_csp_report=false`, the `report-uri /api/csp-report; report-to csp` directives in the strict-profile CSP and the `Reporting-Endpoints: csp="..."` `custom_headers_config` item in `aws_cloudfront_response_headers_policy.site` must be conditionally absent — otherwise the page asks browsers to POST violation reports to a 404. (Moot for p41m0n since it uses the minimal headers profile, but the toggle is reusable for any future stack.)

- **`enable_webauthn_demo`** — gates everything in `infra/webauthn_demo.tf`: Lambda + IAM role + inline policy + log group + Function URL (public, no OAC) + the `null_resource` `npm ci --omit=dev` + archive_file; the `webauthn_credentials` and `webauthn_sessions` DynamoDB tables; the four CloudWatch alarms (`throttles`, `errors`, `body_too_large`, `invocations_zero`); the `webauthn_demo_url` output. The webauthn alarms publish to `csp_report_ops` SNS, so this toggle must not require `enable_csp_report=true` (the CSP-report SNS topic is only created when csp_report is on); when both are off (the p41m0n case) the alarms are gone too, so no orphan reference. When `enable_webauthn_demo=true` and `enable_csp_report=false` (hypothetical other stack), the webauthn alarms need a fallback SNS topic — out of scope for this work since no such stack exists, but worth a `precondition` validation block to fail fast.

- **`enable_ct_monitor`** — gates everything in `infra/ct_monitor.tf`: Lambda + IAM role + role policies + log group + SNS topic + email subscription + EventBridge rule + EventBridge target + Lambda permission. The `local.ct_alert_email` definition (ct_monitor.tf:14) is a pure string and stays unconditional — it's referenced by `csp_report.tf:253` for the SNS subscription endpoint, and removing the local would break csp_report when csp_report is on but ct_monitor is off. In p41m0n where both toggle off, the local is harmlessly unreferenced.

- **`enable_access_logging`** — gates as a single coherent unit: `aws_s3_bucket.logs` (s3.tf:118), all 7 supporting resources for the logs bucket (PAB, ownership, SSE, versioning, lifecycle, policy with both statements), `aws_s3_bucket_logging.site` (s3.tf:57-61), and all three resources in `infra/cloudfront_logging.tf` (`aws_cloudwatch_log_delivery_source.cloudfront_access`, `aws_cloudwatch_log_delivery_destination.cloudfront_access_s3`, `aws_cloudwatch_log_delivery.cloudfront_access`). Splitting bucket and CloudFront-delivery into two separate toggles invites unreachable half-states (CloudFront delivery configured against a missing bucket, or vice versa); one toggle keeps them coherent.

- **`enable_github_deploy_role`** — gates `aws_iam_role.github_deploy`, `data.aws_iam_policy_document.github_deploy_trust`, `data.aws_iam_policy_document.github_deploy`, `aws_iam_role_policy.github_deploy`, and `output "github_deploy_role_arn"`. **`aws_iam_openid_connect_provider.github` (`infra/github_oidc.tf:29-33`) stays unconditional.** The OIDC provider is account-wide (only one provider per AWS account at `https://token.actions.githubusercontent.com`), and millsymills's `aws_iam_role.github_deploy` references its ARN via `aws_iam_openid_connect_provider.github.arn`. Destroying the provider from p41m0n's state would issue a real `iam:DeleteOpenIDConnectProvider` and break the millsymills deploy until someone re-creates and re-imports the provider.

- **`enable_index_rewrite`** — gates `aws_cloudfront_function.index_rewrite` and the `function_association` block inside the default cache behavior in `cloudfront.tf` (the block becomes `dynamic` with `for_each = var.enable_index_rewrite ? [1] : []`). Single-file site doesn't need directory-index rewriting; `default_root_object = "index.html"` handles the apex `/` request.

- **`enable_mta_sts_alias`** — gates `aws_route53_record.mta_sts_a` and `aws_route53_record.mta_sts_aaaa` in `infra/mta_sts.tf`, drops `"mta-sts.${var.domain}"` from `aws_acm_certificate.site.subject_alternative_names` (`infra/acm.tf:11-14`), and drops it from `aws_cloudfront_distribution.site.aliases` (`infra/cloudfront.tf:287`). Pre-existing `enable_mta_sts` (which gates the `_mta-sts` discovery TXT) is independent and also flips off for p41m0n. Two toggles instead of one because some hypothetical future stack might want the alias + cert SAN provisioned (cheap) without the discovery TXT (the actual policy switch).

- **`enable_bimi`** — gates `aws_route53_record.bimi` in `infra/email.tf:126-134`. p41m0n has no brand mark and the BIMI logo URL (`https://p41m0n.com/bimi/logo.svg`) would be a 404 on the new static-image site, so BIMI-honoring receivers (Proton, Fastmail) would fail to render the brand and emit error telemetry. Cheaper to drop the record than to upload a placeholder SVG.

- **`cloudfront_headers_profile`** — string-valued, not boolean, because the CSP / Permissions-Policy / COOP / COEP / CORP block in `aws_cloudfront_response_headers_policy.site` is too coupled to conditionally mutate field-by-field. Two profiles:
  - `"strict"` (millsymills default) — the existing `aws_cloudfront_response_headers_policy.site` resource as it stands today (full CSP, 36-feature Permissions-Policy, COOP/COEP/CORP, Reporting-Endpoints if `enable_csp_report=true`).
  - `"minimal"` (p41m0n) — a NEW `aws_cloudfront_response_headers_policy.site_minimal` resource: HSTS + `X-Content-Type-Options` + `X-Frame-Options: SAMEORIGIN` + `Referrer-Policy: strict-origin-when-cross-origin`. No CSP, no Permissions-Policy, no COOP/COEP/CORP.
  CloudFront's default cache behavior selects between them via:
  ```hcl
  response_headers_policy_id = var.cloudfront_headers_profile == "minimal" \
    ? aws_cloudfront_response_headers_policy.site_minimal[0].id \
    : aws_cloudfront_response_headers_policy.site[0].id
  ```
  Each policy resource gates on its profile via `count`. The `api` and `csp_report` policies stay independent (gated by their own feature toggles).

### CloudFront resource reshaping

`aliases` is an attribute, not a block, so `dynamic` doesn't apply. The list is built with `compact()`:

```hcl
aliases = compact([
  var.domain,
  "www.${var.domain}",
  var.enable_mta_sts_alias ? "mta-sts.${var.domain}" : "",
])
```

`origin` and `ordered_cache_behavior` are blocks, so each Lambda-backed instance becomes a `dynamic` block with `for_each = var.enable_X ? [1] : []`. The S3 origin and the default cache behavior stay as static blocks. `function_association` inside the default cache behavior is also a block, so it becomes `dynamic` gated on `enable_index_rewrite`.

### `moved` blocks are mandatory

Every resource gaining a `count` argument for the first time has its state address change from `aws_X.Y` to `aws_X.Y[0]`. Without `moved` blocks, Terraform plans to destroy the old address and create the new one — which on the millsymills stack would queue up dozens of destructive replacements of currently-deployed Lambdas, IAM roles, S3 buckets, CloudFront policies, and more. That violates the toggle-PR acceptance criterion ("millsymills plan empty") and is a stop-the-line bug.

The toggle PR ships a `moved` block for every resource gaining `count`. Pattern:

```hcl
moved {
  from = aws_lambda_function.inspector_tls
  to   = aws_lambda_function.inspector_tls[0]
}
```

Required for the following resources (non-exhaustive checklist; the implementer must walk every gated resource and add a matching `moved`):

- `infra/inspector_tls.tf` — `aws_iam_role.inspector_tls`, `aws_iam_role_policy_attachment.inspector_tls_basic`, `aws_cloudwatch_log_group.inspector_tls`, `aws_lambda_function.inspector_tls`, `aws_lambda_function_url.inspector_tls`, `aws_cloudfront_origin_access_control.inspector_tls`, `aws_lambda_permission.inspector_tls_cloudfront`.
- `infra/csp_report.tf` — `aws_s3_bucket.csp_report` + 4 supporting (`public_access_block`, `ownership_controls`, `server_side_encryption_configuration`, `lifecycle_configuration`, `policy`); `aws_iam_role.csp_report` + `aws_iam_role_policy_attachment.csp_report_basic` + `aws_iam_role_policy.csp_report_put`; `aws_cloudwatch_log_group.csp_report`; `aws_lambda_function.csp_report`; `aws_lambda_function_url.csp_report`; `aws_cloudfront_origin_access_control.csp_report`; `aws_lambda_permission.csp_report_cloudfront`; `aws_sns_topic.csp_report_ops`; `aws_sns_topic_subscription.csp_report_ops_email`; `aws_cloudwatch_metric_alarm.csp_report_throttles`; `aws_cloudwatch_log_metric_filter.csp_report_put_failed` + `aws_cloudwatch_metric_alarm.csp_report_put_failed`; `aws_cloudwatch_log_metric_filter.csp_report_body_cap_exceeded` + `aws_cloudwatch_metric_alarm.csp_report_body_cap_exceeded`.
- `infra/webauthn_demo.tf` — `aws_dynamodb_table.webauthn_credentials` + `webauthn_sessions`; `null_resource.webauthn_demo_install`; `aws_iam_role.webauthn_demo` + `aws_iam_role_policy.webauthn_demo`; `aws_cloudwatch_log_group.webauthn_demo`; `aws_lambda_function.webauthn_demo`; `aws_lambda_function_url.webauthn_demo`; `aws_cloudwatch_metric_alarm.webauthn_demo_throttles` + `errors` + `body_too_large` + `invocations_zero`.
- `infra/ct_monitor.tf` — `aws_sns_topic.ct_monitor`, `aws_sns_topic_subscription.ct_monitor_email`, `aws_iam_role.ct_monitor`, `aws_iam_role_policy_attachment.ct_monitor_basic`, `aws_iam_role_policy.ct_monitor_publish`, `aws_cloudwatch_log_group.ct_monitor`, `aws_lambda_function.ct_monitor`, `aws_cloudwatch_event_rule.ct_monitor`, `aws_cloudwatch_event_target.ct_monitor`, `aws_lambda_permission.ct_monitor_eventbridge`.
- `infra/s3.tf` — `aws_s3_bucket.logs` + 7 supporting (`public_access_block`, `ownership_controls`, `server_side_encryption_configuration`, `versioning`, `lifecycle_configuration`, `policy`); `aws_s3_bucket_logging.site`.
- `infra/cloudfront_logging.tf` — `aws_cloudwatch_log_delivery_source.cloudfront_access`, `aws_cloudwatch_log_delivery_destination.cloudfront_access_s3`, `aws_cloudwatch_log_delivery.cloudfront_access`.
- `infra/github_oidc.tf` — `aws_iam_role.github_deploy`, `aws_iam_role_policy.github_deploy`. NOT the OIDC provider.
- `infra/mta_sts.tf` — `aws_route53_record.mta_sts_a`, `aws_route53_record.mta_sts_aaaa`.
- `infra/email.tf` — `aws_route53_record.bimi`.
- `infra/cloudfront.tf` — `aws_cloudfront_function.index_rewrite`, `aws_cloudfront_origin_request_policy.inspector_tls`, `aws_cloudfront_origin_request_policy.csp_report`, `aws_cloudfront_response_headers_policy.api`, `aws_cloudfront_response_headers_policy.csp_report`, `aws_cloudfront_response_headers_policy.site`.

The `moved` blocks live alongside the gated resources (e.g., the inspector_tls `moved` blocks live in `inspector_tls.tf`). Once millsymills has been applied at least once with the new addressing, the `moved` blocks become no-ops and could be deleted in a future cleanup — but leave them in place; they're cheap and they document the refactor.

`moved` blocks are NOT needed for: `aws_iam_openid_connect_provider.github` (not gaining count), `aws_acm_certificate.site` (not gaining count — the SAN list change is a `subject_alternative_names` argument change, which Terraform handles in-place via the existing `create_before_destroy` lifecycle), `aws_cloudfront_distribution.site` (not gaining count — the dynamic-block conversion is invisible to state), or any resource whose address isn't changing.

### `infra/stacks/p41m0n.tfvars` (final shape)

```hcl
aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# deploy_workflow / deploy_environment removed — no GH deploy workflow for
# the slimmed stack (see enable_github_deploy_role = false). The CI gate
# in ci.yml that asserts per-stack deploy_workflow files exist needs the
# absence handled (an empty string falls back to the default `deploy.yml`,
# which exists, so the assertion still passes — but no `rehearsal`
# environment is needed since no workflow targets p41m0n).

# All heavyweight features off.
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

# Mail: Proton catchall stays. Verification token + DKIM selectors as before.
protonmail_dkim_selectors = {
  protonmail  = "protonmail.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail2 = "protonmail2.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail3 = "protonmail3.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
}
```

Removed lines from the previous `p41m0n.tfvars`: `deploy_workflow`, `deploy_environment`, `ct_monitor_alert_address` (Lambda gone, var unused), `enable_mta_sts`, `mta_sts_id`. The `protonmail_verification_token` is still supplied at apply time via `TF_VAR_protonmail_verification_token` env var (not committed) — same as today.

Note on the CI gate at `ci.yml:200-211` (per-stack deploy_workflow files exist): with `deploy_workflow` removed from p41m0n.tfvars, the existing logic falls back to `deploy.yml` (which exists for millsymills), so the assertion still passes for p41m0n. The OIDC trust pinning is moot because there's no deploy role for p41m0n anymore.

## Content (in `p41m0n.com` repo)

Two files at the repo root:

**`face-of-mercy.jpg`** — derived from `~/Downloads/IMG_0220_Original.jpg` via:

```sh
magick ~/Downloads/IMG_0220_Original.jpg -auto-orient -strip -quality 85 face-of-mercy.jpg
```

`-auto-orient` normalizes rotation before EXIF strip (otherwise stripping the orientation tag could rotate the displayed image). `-strip` removes all EXIF/IPTC/XMP metadata, including the GPS-Data tag flagged by `file(1)` on the original. `-quality 85` re-encodes ~50–80% smaller with no perceptible loss. Verify the result with `exiftool face-of-mercy.jpg` showing nothing beyond JFIF basics.

**`index.html`** — minimal, no JS, no external assets:

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

`noindex,nofollow` keeps the page out of search results. `<title>p41m0n.com</title>` avoids leaking content into tab bars / link previews. No `<head>` or `<body>` tags — HTML5 makes them optional and the doc still parses correctly in every browser.

## Sequence

### Pre-step PR (millsymills.com)

1. Move `data "aws_caller_identity" "current" {}` from `infra/cloudfront_logging.tf:8` to `infra/main.tf`.
2. Verify `./scripts/tf.sh millsymills plan` empty.
3. Verify `./scripts/tf.sh p41m0n plan` shows only the pre-existing ~43/8/4 drift baseline (this move adds zero new delta — stash-compare to confirm). The drift itself stays unresolved until Phase 4's tfvars flip; this step is the move-impact check, not a drift-resolution gate.
4. Merge.

### Toggle PR (millsymills.com)

1. Add the 9 boolean variables and the `cloudfront_headers_profile` string variable to `infra/variables.tf`.
2. Add `count = var.enable_X ? 1 : 0` gates to all listed standalone resources across `inspector_tls.tf`, `csp_report.tf`, `webauthn_demo.tf`, `ct_monitor.tf`, `s3.tf` (logs bucket and supporting resources), `cloudfront_logging.tf`, `github_oidc.tf` (deploy role + policies + output only — provider stays), `mta_sts.tf` (A + AAAA aliases), `email.tf` (BIMI). For each gated resource, add a paired `moved` block per the `moved` blocks are mandatory section above. Update consumers to use `try(...[0]..., null)` or `compact()` patterns.
3. In `infra/cloudfront.tf`: convert the four Lambda-backed `origin` blocks and the two `ordered_cache_behavior` blocks to `dynamic` form gated on their respective `enable_*` flags; convert `aliases` to the `compact()` form; convert `function_association` to `dynamic` gated on `enable_index_rewrite`; switch `default_cache_behavior.response_headers_policy_id` to the conditional based on `cloudfront_headers_profile`.
4. In `infra/acm.tf`: convert `subject_alternative_names` to `compact(["www.${var.domain}", var.enable_mta_sts_alias ? "mta-sts.${var.domain}" : ""])`.
5. Add `aws_cloudfront_response_headers_policy.site_minimal` (a new resource gated by `count = var.cloudfront_headers_profile == "minimal" ? 1 : 0`) with HSTS + nosniff + X-Frame-Options + Referrer-Policy only.
6. Gate `aws_cloudfront_response_headers_policy.site` itself with `count = var.cloudfront_headers_profile == "strict" ? 1 : 0`.
7. Verify `./scripts/tf.sh millsymills plan` empty (every default is `true` / `"strict"`; `moved` blocks preserve all existing addresses).
8. Verify `./scripts/tf.sh p41m0n plan` resource-set is identical to its pre-toggle baseline (the ~43/8/4 pre-existing drift carries through unchanged — no tfvars change means defaults stay true means TF still wants the same resources). Use a diff-of-plans against a fresh `origin/main` checkout to confirm zero new resource lines added or removed.
9. Merge.

### Cleanup PR (millsymills.com), single coordinated commit

1. Delete `.github/workflows/deploy-rehearsal.yml`.
2. Delete `scripts/verify-p41m0n.sh`, `scripts/assert-no-rehearsal-leakage.sh`, `scripts/assert-no-url-leakage.sh`.
3. Delete the two `Assert no ... leakage` steps from `.github/workflows/ci.yml:127-131`.
4. Delete the three `env: SITE_URL: https://millsymills.com` blocks from `ci.yml:89-90`, `:94-95`, `:109-110`.
5. Revert `astro.config.mjs:120-138` SITE_URL/NO_INDEX plumbing: drop the `siteUrl`/`noIndex` env-var reads, the URL-validation guard, the `NO_INDEX`+`millsymills.com` cross-check, the CI-mandatory-SITE_URL guard, and the `vite.define` injection of `import.meta.env.NO_INDEX`. `site:` becomes a hardcoded `'https://millsymills.com'`.
6. Revert `Astro.site`-driven canonical/og/JSON-LD URL emission in `src/layouts/BaseLayout.astro`, `src/layouts/DesktopLayout.astro`, `src/pages/index.astro`, `src/pages/[app].astro`, `src/pages/sitemap.xml.ts` back to hardcoded `https://millsymills.com`. Drop the `noindex` prop reads gated on `import.meta.env.NO_INDEX` from BaseLayout / DesktopLayout (per-page `noindex` props stay).
7. **Atomically** in the same commit: delete `src/pages/robots.txt.ts` AND restore `public/robots.txt` (the permissive form, with `Sitemap: https://millsymills.com/sitemap.xml`). Both files must not coexist even briefly in the working tree at commit time — Astro errors on duplicate route handlers.
8. Update `src/data/security-controls.ts` — five explicit edits:
   - **Line 229** (`dkim` control, `code` array): KEEP `'infra/stacks/p41m0n.tfvars'`. The Proton DKIM selectors stay in p41m0n's tfvars after teardown (mail catchall preserved), so the path is still factually accurate.
   - **Line 260** (`mta-sts` control, `code` array): REMOVE `'infra/stacks/p41m0n.tfvars'`. After teardown, `enable_mta_sts` and `mta_sts_id` are no longer in p41m0n's tfvars. ALSO update the `tradeoffs` field on this control to drop the "on both stacks" framing — current text reads "Currently in `mode: testing` (`max_age: 86400`) on both stacks". Replace with "Currently in `mode: testing` (`max_age: 86400`) on `millsymills.com` (the only stack with MTA-STS enabled after the p41m0n teardown)".
   - **Line 279** (`oidc-deploy` control, `what` text): change `'deploy.yml / deploy-rehearsal.yml'` to `'deploy.yml'`. After teardown, only `deploy.yml` exists.
   - **Line 305** (`slsa-cosign` control, `code` array): REMOVE `'.github/workflows/deploy-rehearsal.yml'`. The file is deleted.
   - **Line 316** (`s3-tls-only` control, `tradeoffs` text): replace `'Same posture applies to the rehearsal stack — both `tf.sh millsymills` and `tf.sh p41m0n` plans must show the bucket-policy update before merging changes here.'` with `'Same posture applies to both stacks — `tf.sh millsymills` and `tf.sh p41m0n` plans must both show the bucket-policy update before merging changes here.'` (drops the "rehearsal" framing; both stacks still exist and still apply the same bucket policy).
9. Remove `'https://p41m0n.com'` and `'https://www.p41m0n.com'` from `infra/inspector_tls.mjs` `ALLOWED_ORIGINS`. **Note in the PR description (operational footnote):** the millsymills inspector_tls Lambda's deployed bundle still contains the old allowlist until the next millsymills apply triggers a `source_code_hash` change. Cosmetic delay only — no p41m0n.com origin is making cross-origin requests after the teardown.
10. In `infra/cloudfront.tf`, reword the comments around `aws_cloudfront_response_headers_policy.api` (lines ~174-182) and `aws_cloudfront_origin_request_policy.csp_report` and `aws_lambda_permission.csp_report_cloudfront` (lines ~209-216) that name `p41m0n.com` as the CORP `cross-origin` consumer. The CORP `cross-origin` value stays (architecturally correct for any future cross-origin caller); only the comment changes — e.g., "future cross-origin caller (none currently)."
11. Delete the `rehearsal` GitHub Environment: `gh api -X DELETE repos/millsmillsymills/millsymills.com/environments/rehearsal`. Run this command from the operator's terminal after merge; do not script it into the workflow file (it requires elevated `gh` auth).
12. Verify `./scripts/tf.sh millsymills plan` empty after merge.
13. Verify `./scripts/tf.sh p41m0n plan` resource-set is identical to its pre-cleanup baseline (cleanup PR is source-only; the pre-existing ~43/8/4 drift carries through unchanged — no Terraform impact expected).
14. Verify CI green on the cleanup PR — specifically `assert-security-controls-paths.sh` (proves the `security-controls.ts` edits caught all stale references).

### Content PR (p41m0n.com)

1. Generate `face-of-mercy.jpg` via the `magick` command in the Content section.
2. Verify `exiftool face-of-mercy.jpg` shows no EXIF beyond JFIF basics.
3. Commit `index.html` and `face-of-mercy.jpg` to the repo root.
4. Merge.

### Apply phase (operator, from millsymills.com checkout)

1. Edit `infra/stacks/p41m0n.tfvars` to the final shape shown earlier.
2. `./scripts/tf.sh p41m0n init -reconfigure`.
3. `./scripts/tf.sh p41m0n plan`. Expect (based on the actual `state list` inventory above — csp_report, webauthn_demo, and MTA-STS are absent from state, so they're no-ops, not destroys):
   - **Destroys (~36 resources, all currently in p41m0n state):**
     - `aws_lambda_function.inspector_tls` + role + role_policy_attachment + log group + Function URL + OAC + permission + origin-request policy + response-headers policy `api` (9 resources).
     - `aws_lambda_function.ct_monitor` + role + role_policy_attachment + role_policy + log group + SNS topic + email subscription + EventBridge rule + target + permission (10 resources).
     - `aws_route53_record.bimi` (BIMI TXT).
     - `aws_cloudfront_function.index_rewrite`.
     - `aws_iam_role.github_deploy` + `aws_iam_role_policy.github_deploy` (deploy role + policy — NOT the OIDC provider).
     - `aws_s3_bucket.logs` + 7 supporting (`public_access_block`, `ownership_controls`, `server_side_encryption_configuration`, `versioning`, `lifecycle_configuration`, `policy`) + `aws_s3_bucket_logging.site` (9 resources).
     - 3 `cloudfront_logging` delivery resources (`source`, `destination`, `delivery`).
     - `aws_cloudfront_response_headers_policy.site` (replaced by `site_minimal` — see Create below).
   - **Create:** `aws_cloudfront_response_headers_policy.site_minimal` (1 resource — driven by `cloudfront_headers_profile=minimal`).
   - **Update in-place:** `aws_cloudfront_distribution.site` (origins shrink, ordered cache behaviors removed, response-headers policy swaps to `site_minimal`, `function_association` removed).
   - **No change (deployed but untouched by toggles):** `aws_acm_certificate.site` (cert SAN list is already apex + www — toggle PR's `enable_mta_sts_alias=false` matches deployed state, so no replacement); `aws_acm_certificate_validation.site`; `aws_route53_record.cert_validation["p41m0n.com"]` + `["www.p41m0n.com"]`; `aws_route53_record.root_a`/`root_aaaa`/`www_a`/`www_aaaa`/`mx`/`apex_txt`/`dkim` (×3)/`dmarc`/`tlsrpt`/`caa`; DNSSEC resources (KMS key + alias + KSK + zone DNSSEC); `aws_iam_openid_connect_provider.github`; `aws_s3_bucket.site` and its 8 supporting resources; `aws_cloudfront_origin_access_control.site`.
   - **No-op (NOT in state, won't be created because toggle is false):** csp_report suite (22 resources), webauthn_demo suite (12 resources), MTA-STS A/AAAA/TXT records, `aws_route53_record.cert_validation["mta-sts.p41m0n.com"]`. These appear in the current pre-toggle-PR plan as "to create" — after the toggle PR + the tfvars flip, they vanish entirely from the plan.
4. Review the plan against the expected list. Stop-the-line conditions:
   - Any destroy of `aws_iam_openid_connect_provider.github`.
   - Any destroy of `aws_s3_bucket.site` or its supporting resources.
   - Any destroy of DNSSEC resources (also guarded by `prevent_destroy=true`).
   - Any *create* of csp_report / webauthn_demo / MTA-STS resources (would mean the toggle didn't take effect).
   - Any cert REPLACEMENT (would mean the SAN list still differs — re-check `enable_mta_sts_alias` in tfvars).
5. `./scripts/tf.sh p41m0n apply`. Wall-clock ~10-15 minutes — dominated entirely by CloudFront distribution propagation. No ACM cert validation race (no cert change), no Lambda cold-start delays (no Lambdas being created).

### One-shot upload (operator, local AWS creds)

```sh
aws s3 cp index.html s3://p41m0n.com/index.html \
  --content-type text/html --cache-control "public,max-age=300"
aws s3 cp face-of-mercy.jpg s3://p41m0n.com/face-of-mercy.jpg \
  --content-type image/jpeg --cache-control "public,max-age=86400"
aws cloudfront create-invalidation \
  --distribution-id "$(./scripts/tf.sh p41m0n output -raw cloudfront_distribution_id)" \
  --paths "/*"
```

`max-age=300` on `index.html` so HTML edits propagate within 5 minutes; `max-age=86400` on the JPEG since it's effectively immutable. Local AWS credentials must have `s3:PutObject` on `s3://p41m0n.com/*` and `cloudfront:CreateInvalidation` on the distribution — operator's existing admin profile satisfies both; no new IAM is created for this work.

### Verification

- `curl -sI https://p41m0n.com/` returns 200, `Content-Type: text/html`, and `Strict-Transport-Security` header present.
- `curl -sI https://p41m0n.com/face-of-mercy.jpg` returns 200, `Content-Type: image/jpeg`, and HSTS present.
- `curl -sI https://www.p41m0n.com/` reaches the same content (CloudFront alias).
- `dig +short mta-sts.p41m0n.com` returns NXDOMAIN.
- `dig +short TXT default._bimi.p41m0n.com` returns NXDOMAIN.
- `dig +short MX p41m0n.com` returns the two Proton MX records.
- `dig +short TXT _smtp._tls.p41m0n.com` returns the TLSRPT record.
- Browser smoke test: full-screen meme on a black background, no JS errors, no failed asset fetches.
- Send a test email to `test+teardown@p41m0n.com`, verify arrival in `overm1nd@pm.me`.

### Loopback check

The pre-step + toggle + cleanup PRs (millsymills.com) all merged; the content PR (p41m0n.com) merged; the apply phase complete; the one-shot upload done; verification passed. Remaining audits (do once, mark done):

- `aws iam get-open-id-connect-provider --open-id-connect-provider-arn arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com` returns OK (provider survived).
- `aws iam list-roles | jq '.Roles[] | select(.RoleName == "p41m0n-com-github-deploy")'` returns empty (deploy role gone).
- `aws s3 ls s3://p41m0n.com-logs` returns NoSuchBucket (logs bucket gone).
- `aws s3 ls s3://p41m0n.com-csp-reports` returns NoSuchBucket (CSP reports bucket never existed, but confirm it still doesn't).
- `aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'p41m0n-com-')].FunctionName"` returns `[]` (both deployed Lambdas — inspector_tls + ct_monitor — gone; csp_report + webauthn_demo never existed).
- `aws dynamodb list-tables --query "TableNames[?starts_with(@, 'p41m0n-com-')]"` returns `[]` (webauthn DynamoDB tables never existed; confirm absent).

## Acceptance criteria

1. `./scripts/tf.sh millsymills plan` returns an empty plan after the pre-step PR, after the toggle PR, and after the cleanup PR — at each checkpoint independently. (Manual gate; CI runs `terraform validate` only.)
2. `./scripts/tf.sh p41m0n plan` after the p41m0n.tfvars edits shows ONLY: ~36 destroys (inspector_tls suite, ct_monitor suite, github_deploy role + policy, index_rewrite function, BIMI record, logs bucket + supporting + s3_bucket_logging, three cloudfront_logging deliveries, response_headers_policy `site` + `api`), 1 create (`site_minimal`), 1 update (CloudFront distribution). **No** cert replacement, **no** csp_report/webauthn_demo/MTA-STS creates or destroys.
3. `aws_iam_openid_connect_provider.github` is still present in the AWS account after the p41m0n apply.
4. `https://p41m0n.com/` and `https://www.p41m0n.com/` serve the meme over HTTPS with HSTS; raw `/face-of-mercy.jpg` returns `image/jpeg`.
5. `mta-sts.p41m0n.com` is NXDOMAIN; `default._bimi.p41m0n.com` is NXDOMAIN.
6. Proton catchall to `*@p41m0n.com` still delivers (verified by sending a test message).
7. CI passes on millsymills's `main` after the cleanup PR — specifically `assert-security-controls-paths.sh` passes.
8. `exiftool face-of-mercy.jpg` shows no EXIF beyond JFIF basics.

## Out of scope

- **No new CI for p41m0n.** Future content swaps are operator-driven via local AWS creds.
- **Route53 hosted zone and registrar NS unchanged.** The zone stays — mail still needs it. NS at Gandi still points at Route53.
- **Terraform state object for p41m0n stays** in the shared `millsymills-terraform-state` bucket. After teardown the state file is much smaller but still present — both `tf.sh` and any future re-application depend on it.
- **Proton custom-domain entry on Proton's side is untouched.** The Proton account still owns `p41m0n.com` for catchall delivery.
- **`aws_iam_openid_connect_provider.github` is untouched.** Account-wide resource shared with millsymills's deploy role.
- **No tear-down of DNSSEC.** The KMS KSK + Route53 zone-signing config + DS at Gandi all stay. `prevent_destroy = true` on the KSK and KMS key prevents accidental teardown.
- **No tear-down of CAA records.** Cheap to keep; restricts future cert issuance to AWS CAs.
- **No registrar-side changes.** No NS flip, no DS rotation, no domain transfer.
- **No millsymills.com infra changes** beyond the comment rewording in `cloudfront.tf` and the source-only edits in `inspector_tls.mjs`. millsymills's deploy pipeline, OIDC role, IAM policies, response-headers policy, and live behavior are unaffected.

## What this design explicitly does NOT validate

- **The CSP-report endpoint disable behavior.** `enable_csp_report=false` on a stack with `cloudfront_headers_profile="strict"` would leave the CSP `report-uri /api/csp-report; report-to csp` directives + `Reporting-Endpoints` header pointing at a 404. p41m0n uses `cloudfront_headers_profile="minimal"` so this combination doesn't arise here, but a future stack flipping only `enable_csp_report` would hit the issue. Out of scope to fix preemptively; flag for any future work that uses the toggle.
- **The webauthn-demo SNS-topic dependency.** Webauthn alarms publish to the `csp_report_ops` topic; toggling `enable_webauthn_demo=true` with `enable_csp_report=false` would dangle the alarm references. p41m0n turns both off so this doesn't arise. A `precondition` validation on the webauthn alarms would prevent the bad combination — out of scope here.
- **A future "tear down p41m0n entirely" path.** Removing the Route53 hosted zone, the DNSSEC keys (with the registrar-DS-removal and parent-TTL-wait sequence from `infra/dnssec.tf:21-26`), the registrar NS flip back to Gandi LiveDNS, and the Terraform state object are all out of scope. This spec keeps the slimmed stack live indefinitely.
