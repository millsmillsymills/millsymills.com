variable "aws_region" {
  description = "Primary AWS region. ACM + DNSSEC KMS keys + CloudFront-logs delivery are pinned to us-east-1 via the `aws.us_east_1` provider alias regardless of this value (CloudFront / Route53 DNSSEC service constraints) — see `infra/main.tf` and `infra/dnssec.tf` for the alias usage."
  type        = string
  default     = "us-west-2"
}

variable "domain" {
  description = "Root domain name"
  type        = string
  default     = "millsymills.com"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to assume the deploy role via OIDC. No default: forks must set this explicitly so the deploy role can't be trivially assumed by the upstream repo."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repo))
    error_message = "github_repo must be in `owner/name` form (e.g. `millsmillsymills/millsymills.com`)."
  }
}

variable "deploy_branch" {
  description = "Git branch on `github_repo` that is allowed to assume the deploy role."
  type        = string
  default     = "main"
}

variable "github_token" {
  description = "GitHub token used by the `github` provider to manage repo-level controls (currently just the `main` branch protection rule). Supply a fine-grained PAT scoped to `var.github_repo` with `Repository permissions → Administration: Read and write`. Pass via `TF_VAR_github_token=...` (preferred — never lands in tfvars on disk) or as `github_token = \"...\"` in `infra/terraform.tfvars` (gitignored). `TF_VAR_github_token=$(gh auth token)` is fine for one-off applies, but `gh auth token` is the gh CLI's broad-scope OAuth token (no per-token expiry; rotates only on CLI re-auth) — for routine ops, export a fine-grained PAT instead so rotation is per-token. Required for every plan/apply once the `github_branch_protection_v3` resource is in state: Terraform refreshes every managed resource on each run, and a blank token surfaces as `401 Bad credentials` from the GitHub API during refresh. Use `-target=` flags + `-refresh=false` to skip GitHub temporarily if you need an AWS-only emergency apply."
  type        = string
  default     = ""
  sensitive   = true
}

variable "deploy_workflow" {
  description = "Workflow filename (under `.github/workflows/`) allowed to mint the OIDC token for this stack. Pins the IAM trust policy's `job_workflow_ref` condition so a different (or tampered) workflow on the same branch can't assume the deploy role."
  type        = string
  default     = "deploy.yml"
}

variable "deploy_environment" {
  description = "GitHub Actions Environment name that the deploy workflow's `environment:` block targets. Must match exactly — when a job declares an environment, GitHub puts it in the OIDC `sub` claim (`repo:owner/name:environment:<name>`), and the IAM trust policy uses that value. See header of `infra/github_oidc.tf` for the full claim model."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+$", var.deploy_environment)) && length(var.deploy_environment) > 0
    error_message = "deploy_environment must be a non-empty GitHub Environment name (alphanumeric plus . _ -). An empty or malformed value silently produces a trust policy that no real OIDC token can satisfy."
  }
}

variable "protonmail_verification_token" {
  description = "ProtonMail domain-verification token (from Proton admin after adding the domain). Blank means email is not yet active: DNS deploys null MX + sender-free SPF so the domain is unspoofable."
  type        = string
  default     = ""
  sensitive   = true
}

variable "protonmail_dkim_selectors" {
  description = "ProtonMail DKIM selector -> CNAME target, e.g. { protonmail = \"protonmail.domainkey.abcdef.domains.proton.ch.\" }. Populate after Proton verifies the domain."
  type        = map(string)
  default     = {}
}

variable "dmarc_report_address" {
  description = "Mailbox that receives DMARC aggregate reports (rua). Leave blank to default to `dmarc@<var.domain>`. Configure the chosen address as an address or alias in ProtonMail."
  type        = string
  default     = ""
}

variable "tlsrpt_report_address" {
  description = "Mailbox that receives SMTP TLS Reporting (RFC 8460) aggregate reports. Leave blank to default to `tls-rpt@<var.domain>`. Configure the chosen address as an address or alias in ProtonMail."
  type        = string
  default     = ""
}

variable "caa_iodef_address" {
  description = "Mailbox that receives CAA violation reports (iodef). Leave blank to default to `security@<var.domain>`. Configure the chosen address as an address or alias in ProtonMail. Reporting is best-effort — not all CAs honor iodef."
  type        = string
  default     = ""
}

variable "ct_monitor_alert_address" {
  description = "Mailbox / alias that receives CT log monitoring alerts (SNS email subscription). Leave blank to default to `security@<var.domain>`. The address must confirm the AWS subscription email after first apply or alerts go nowhere."
  type        = string
  default     = ""
}

variable "ct_monitor_extra_issuers" {
  description = "Extra issuer organization names to add to the CT-monitor allow-list, alongside the always-included `Amazon`. Each value is matched against the `O=` or `CN=` component of the issuer DN (case-insensitive); free-substring matching was tightened to avoid silently allow-listing future CAs whose DN happens to contain an allow-listed name in an unrelated component. Use only if you start issuing certs for this domain from a CA other than ACM (e.g. `[\"Let's Encrypt\"]`)."
  type        = list(string)
  default     = []
}

variable "google_workspace_verifications" {
  description = "Google Workspace domain-verification CNAMEs to publish in Route53. Map of host-label (left of the apex) to the `gv-*.dv.googlehosted.com.` target Google issues when you add a domain in the Workspace admin console. Each entry produces `<key>.<domain>` CNAME → `<value>`. Empty by default; populate per-stack only for domains that use Workspace services (Drive/Calendar/etc.). Migration salvage: pre-cutover this was managed at the old DNS provider; carry-over via this variable preserves verification across the NS flip."
  type        = map(string)
  default     = {}
}

variable "enable_mta_sts" {
  description = "Publish the `_mta-sts.<domain>` TXT record so SMTP senders discover the MTA-STS policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt`. Default false because MTA-STS only makes sense once Proton (or another mail provider) is live AND the policy file has been observed by senders -- enable per-stack via `<stack>.tfvars`. The `mta-sts.<domain>` ACM SAN + CloudFront alias + A/AAAA records are provisioned regardless (they're cheap and harmless), so flipping this on later costs only a Route53 TXT publish + the policy ID bump."
  type        = bool
  default     = false
}

variable "mta_sts_id" {
  description = "Opaque identifier published in the `_mta-sts.<domain>` TXT record (`v=STSv1; id=<id>`). Senders refresh their cached policy when this value changes; bump it whenever the policy contents (mode, max_age, mx hosts) change. Format is opaque per RFC 8461 -- a YYYYMMDDHHMMSS timestamp keeps it monotonic and human-readable."
  type        = string
  default     = "20260507000000"

  validation {
    condition     = can(regex("^[A-Za-z0-9]{1,32}$", var.mta_sts_id))
    error_message = "mta_sts_id must be 1-32 alphanumeric chars per RFC 8461 §3.1."
  }
}

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
