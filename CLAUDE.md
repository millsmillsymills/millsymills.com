# millsymills.com

Personal/portfolio website. Currently hosted on Squarespace; this repo is the redesigned site that will replace it when migrated to AWS.

## Stack

- **Frontend**: Astro 6 (static output) — `src/` contains pages and components
- **Hosting**: AWS S3 + CloudFront + Route53 + ACM — `infra/` contains Terraform
- **IaC**: Terraform 1.10+

## Documented solutions

`docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.

## Security controls

Every shipped security control (DNSSEC, CAA, CT monitor, CSP headers, SBOM, mail-auth, etc.) has an entry in `src/data/security-controls.ts`, which renders the public-facing `/security/` page. **When you ship a new control — or move one from `roadmap` to `shipped` — update that file in the same PR.** The page's whole credibility is "every claim cites the implementation"; drift between page and reality is worse than no page at all. `Policy:` field of `/.well-known/security.txt` points at `/security/` so researchers land there from the canonical contact surface.

## Aesthetic conventions

- **Theme:** neon-noir vaporwave — dark navy/black surfaces, hot pink + cyan accents, lilac/cream supporting. Tokens live in `src/styles/desktop.css :root` (`--bg-void`, `--bg-deep`, `--neon-pink`, `--neon-cyan`, etc.). Legacy `--pink-*` / `--cream` / `--border` names are repointed to new values, not renamed, so any code referencing them keeps working.
- **"mills" is always lowercase.** Branding rule — never "Mills", "MILLS", "MillsOS", "MILLS-OS". Applies to UI chrome text, window titles, code comments, docs. Existing chrome already honors this (`mills@millsymills:~$` in the start menu, lowercase app labels in `src/data/apps.ts`).
- **Asset directories:**
  - `public/images/vaporwave-ui/ui-icons/` — window controls (minimize, maximize, close)
  - `public/images/vaporwave-ui/buttons/` — Music transport buttons (prev, play, pause, next, mute, unmute)
  - `public/images/vaporwave-ui/misc/` — occasional decorative icons
  - `public/images/noise.png` — tileable grain for the `.motif-grain` overlay
- **Motif utilities** (`.motif-grain`, `.motif-chrom`) are opt-in texture classes in `desktop.css`. Grain is mounted once via `<div class="motif-grain">` in `DesktopLayout.astro` so it paints above windows but below the taskbar. Terminal's CRT scanlines consume the `--scanlines` custom property directly in its scoped chrome rather than via a utility class.
- **Hero apps** (Terminal, Music, Memes, Photos) have bespoke scoped chrome in their component `<style>` blocks; info-dense apps (About, Projects, Resume, Uses, Flags, Mail, Trash) inherit the base window chrome unchanged.
- **Full spec:** `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md`.
- **`*/` in CSS block comments terminates the comment early in PostCSS.** When documenting token globs like `--pink-*` / `--lilac-*` inside `/* ... */`, space around the asterisks (`--pink-* / --lilac-*`) or the production build fails with "Unknown word".

## Key commands

```bash
npm install          # install dependencies
npm run dev          # local dev server (localhost:4321)
npm run build        # build to dist/
npm run preview      # preview the built site
npm run check        # astro check (typecheck .astro + .ts)
```

`npm run check` only typechecks .astro + .ts — it does NOT run PostCSS. For any CSS edit, run `npm run build` to catch parse errors.

```bash
./scripts/tf.sh millsymills init    # first-time or after provider changes
./scripts/tf.sh millsymills plan    # preview changes
./scripts/tf.sh millsymills apply   # deploy infrastructure
```

```bash
./scripts/ci-local.sh  # run the full CI suite locally (node + terraform)
```

## Terraform notes

- Primary AWS region is `us-west-2` (set in `infra/variables.tf`'s `aws_region` default and reaffirmed per stack in `infra/stacks/<stack>.tfvars`). The state bucket lives in `us-west-2` too — see `infra/stacks/<stack>.backend.hcl`.
- ACM certificate, DNSSEC KMS keys, and CloudFront-logs delivery are pinned to us-east-1 via the `aws.us_east_1` provider alias in `main.tf` (CloudFront / Route53 DNSSEC service constraints). These are unaffected by the primary-region setting.
- Route53 hosted zone for millsymills.com must exist before running `terraform apply` (data source lookup, not managed)
- S3 bucket is private; CloudFront accesses it via Origin Access Control (OAC). Because OAC talks to the S3 REST endpoint (not the S3 website endpoint), the REST endpoint does not auto-resolve `/some/path/` to `/some/path/index.html`. A CloudFront Function (`infra/cloudfront_function_index.js`, attached as a viewer-request association in `cloudfront.tf`) rewrites directory URIs before they reach the origin — otherwise every non-root Astro route would 404.
- Backend S3 bucket for state (`millsymills-terraform-state`, in `us-west-2`) is codified in `infra/bootstrap-state/` (#283). That root has its own backend (local by default) so it can manage the bucket the site stacks depend on without a chicken-and-egg loop. See `infra/bootstrap-state/README.md` for the import + apply path against the existing bucket. The `backend "s3" {}` block in `main.tf` is intentionally empty — all fields (bucket, key, region, encrypt, use_lockfile) come from `infra/stacks/<stack>.backend.hcl` via `terraform init -backend-config=...`, wired up by `scripts/tf.sh`. Uses `encrypt = true` and S3-native state locking (`use_lockfile = true`), requiring Terraform >= 1.10.
- `scripts/verify-state-bucket.sh` audits the live state bucket against the controls codified in `infra/bootstrap-state/main.tf` (versioning, SSE, public-access-block, ownership, TLS-only policy, noncurrent-version lifecycle). Opt-in via `MMS_VERIFY_STATE_BUCKET=true ./scripts/ci-local.sh` because CI runners don't carry AWS creds.

## Migration runbook (Squarespace → AWS)

One-shot cutover checklist. Do these roughly in order; the email steps (Proton) can run in parallel with the web steps.

1. **State bucket.** Use `infra/bootstrap-state/` to create + harden the S3 bucket for Terraform state (`millsymills-terraform-state`, `us-west-2`). The millsymills stack stores its state here under its own key. See `infra/bootstrap-state/README.md` -- the module codifies versioning, SSE-S3, BucketOwnerEnforced ownership, public-access-block, TLS-only bucket policy, and a noncurrent-version lifecycle, so the bucket isn't a hand-managed control plane. For an existing manually-created bucket, `terraform import` first; for a green-field account, `apply` creates it. The `backend "s3" {}` block in `infra/main.tf` is already activated as an empty block; all fields (bucket, key, region, encrypt, use_lockfile) are supplied per-stack via `infra/stacks/<stack>.backend.hcl` at `terraform init` time.
2. **Hosted zone.** In Route53, create a public hosted zone for `millsymills.com`. Do **not** update registrar nameservers yet.
3. **tfvars.** Copy `infra/terraform.tfvars.example` → `infra/terraform.tfvars` and fill in `github_repo` (required) and any **non-secret, stack-agnostic** values. The `infra/terraform.tfvars` file is auto-loaded by terraform on every run regardless of which `-var-file` the wrapper passes, so anything you put here applies to **all** stacks. Stack-specific secrets (e.g., per-stack `protonmail_verification_token`) belong in `infra/stacks/<stack>.secrets.tfvars` — a separate gitignored file that `scripts/tf.sh` auto-loads as the last `-var-file` for plan/apply/destroy/refresh, so its values override anything in the shared file. Keep per-stack secrets there rather than in the shared `infra/terraform.tfvars` so a token for one stack can't leak into another's apply.
4. **Pre-publish ACM validation CNAMEs at the existing registrar.** Targeting `millsymills.com`'s real cutover, the existing registrar is Squarespace (or whatever's authoritative right now per `dig NS millsymills.com`). Step 5's `terraform apply` blocks on `aws_acm_certificate_validation.site`, which polls public DNS for two CNAMEs that AWS auto-generates — but those CNAMEs go into your Route53 zone, which is not yet authoritative. Without breaking the chicken-and-egg first, ACM validation hangs until you cut over, but step 5 can't finish until ACM validates. **This gap is easy to miss** — without handling it, apply hangs ~25 min until your AWS STS token expires, then you debug a credential failure that's actually a DNS chicken-and-egg.
   - **Targeted apply** to materialize the cert + Route53 validation records first (skips CloudFront, which depends on the cert): `./scripts/tf.sh <stack> apply -target=aws_acm_certificate.site -target=aws_route53_record.cert_validation`.
   - **Read the two CNAMEs** AWS expects to see: `aws acm describe-certificate --region us-east-1 --certificate-arn $(terraform -chdir=infra output -raw acm_certificate_arn) --query 'Certificate.DomainValidationOptions[].ResourceRecord'` (or the AWS console). Each record is `{Name, Type=CNAME, Value}`.
   - **Publish both at the existing registrar's DNS.** ~5 min later ACM validation completes via the existing public-DNS path; proceed to step 5.
5. **First apply.** From the repo root: `./scripts/tf.sh millsymills init` then `./scripts/tf.sh millsymills apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy. See `infra/stacks/` for the per-stack config; `./scripts/tf.sh` is the stack-aware wrapper and refuses to touch the wrong state by mistake.
   - **If the apply fails partway through the DNSSEC chain** (KMS key/Route53 KSK provisioning is the slowest, eventual-consistency-prone step in us-east-1), recover by completing the us-east-1 chain first with `./scripts/tf.sh <stack> apply -target=aws_kms_key.dnssec -target=aws_kms_alias.dnssec -target=aws_route53_key_signing_key.ksk -target=aws_route53_hosted_zone_dnssec.site`, then re-run the full apply.
   - **If your AWS auth gives short-lived STS tokens** (e.g., the `aws-login` SSO plugin issues ~15-min tokens by default), a single-shot `apply` will outlast the token TTL and fail mid-run with `ExpiredToken` on the final state save plus possibly leaving a stale state lock. Recovery is idempotent: re-export creds with `eval "$(aws configure export-credentials --format env-no-export | sed 's/^/export /')"`, force-unlock with `./scripts/tf.sh <stack> force-unlock -force <ID>` (lock ID is in the error output), and re-run apply. Each iteration converges (state has fewer resources to create). Better long-term: switch to `aws-vault exec` or a profile with longer-lived credentials so apply doesn't need the resume dance.
6. **Smoke test via CloudFront domain.** `terraform output cloudfront_domain` gives you `d1234abcd.cloudfront.net`. Put a single test file at `s3://millsymills.com/index.html` (or build + `aws s3 sync`) and confirm `https://d1234abcd.cloudfront.net/` serves it. Validates CloudFront + OAC + S3 before DNS cutover.
7. **Wire up GitHub Actions.** Set the env-scoped variables on the `production` environment (see "Deploy workflow" below), push to `main`, confirm `dist/` is live at the CloudFront domain.
   - **Note on plan limits.** As of #144 the repo is on GitHub Pro, so required-reviewer protection on Environments and `Require signed commits` branch protection are both available (the free private plan rejected both with HTTP 422 / 403). Required-reviewer on `production` is intentionally NOT enabled because the monthly `schedule:` deploy in `deploy.yml` is what keeps `/.well-known/security.txt`'s `Expires:` field fresh — gating it behind manual approval defeats the unattended-cron property. The trust boundary is still the OIDC `sub` claim (`environment:production`) + `job_workflow_ref` pin in `infra/github_oidc.tf`, which restricts deploys to the exact `deploy.yml` file on `main`. See the trust-model comment block at the top of `deploy.yml`.
8. **Registrar cutover.** At the domain registrar, replace the nameserver records with the four NS records from `terraform output` (or from the Route53 hosted zone page). This is the point of no return. Downtime window depends on the OLD nameserver TTL; for squarespace.com → Route53, usually <1 hour. **NS rollback is governed by the parent-zone delegation TTL, not your record TTLs** — a bad NS flip can take up to ~48h to fully roll back for `.com`, so plan to fix-forward rather than flip-back, and validate exhaustively before the flip.
9. **Verify.** Once the NS change propagates:
   - `https://millsymills.com/` serves the new site.
   - `https://www.millsymills.com/` serves the new site.
   - Both resolve over IPv4 and IPv6 (`dig A` and `dig AAAA`).
   - `curl --tlsv1.3 --tls-max 1.3 -I https://millsymills.com/` succeeds (TLS 1.3-only floor is enforced).
   - `curl -I https://millsymills.com/` shows HSTS, CSP, X-Content-Type-Options, Referrer-Policy, COOP/COEP/CORP.
   - `openssl s_client -connect millsymills.com:443 -groups X25519MLKEM768 </dev/null 2>/dev/null | grep "Server Temp Key"` returns `Server Temp Key: X25519MLKEM768` (post-quantum hybrid KEX is negotiating; requires openssl ≥ 3.5 client-side).
   - **HSTS preload submission.** Once verify is clean and `hstspreload.org/api/v2/preloadable?domain=<fqdn>` returns `{errors:[], warnings:[]}` and every in-use subdomain (`www.`, `mta-sts.`, anything else) serves HTTPS, submit at https://hstspreload.org/. **Removal is asymmetric and slow** — to back out, first publish `Strict-Transport-Security: max-age=0` and verify it's live, then file a removal request at https://hstspreload.org/removal/. Chrome propagates removals over the next ~12 weeks via the browser release train; Firefox/Safari are similar. Until propagation completes, every browser that has shipped a preloaded build will refuse HTTP and refuse to honor `max-age=0`. **Do not submit until the long-term posture is settled.**
10. **Email activation.** Follow the ProtonMail runbook below — independent of web, can happen before or after.
11. **DNSSEC chain at registrar.** Route53 starts signing on first apply (#125), but the parent zone (`.com`) only enforces validation once a DS record is published at the registrar. Order matters — getting it wrong takes ~50% of the world's resolvers offline until parent-TTL expires. See `infra/dnssec.tf` for the full ordering; the short version: confirm signing is live with `dig +dnssec @ns-XXX.awsdns-XX.com millsymills.com`, submit the DS to the registrar (see API call below if Gandi), then verify a green run on https://dnsviz.net/d/millsymills.com/dnssec/. **Reversal is asymmetric: REMOVE the DS record at the registrar FIRST and wait the parent TTL BEFORE disabling signing in Terraform**, or the zone goes BOGUS for validating resolvers.
   - **Submitting DS via API at Gandi.** Gandi's `POST /v5/domain/domains/<fqdn>/dnskeys` does NOT accept the standard DS quadruple (keytag/algorithm/digest_type/digest). The `terraform output -raw dnssec_ds_record` value is for *parent-zone verification* only, not direct submission. Gandi expects the DNSKEY itself and computes the DS internally. Run `GANDI_API_KEY=... ./scripts/gandi-submit-ds.sh <fqdn> <stack>` (the script reads the live KSK from the Route53 zone and POSTs the right shape; reverse with the DELETE-by-id path documented in its header). **Squarespace as the millsymills registrar:** submit DS via their UI — `gandi-submit-ds.sh` is Gandi-specific.
   - **Stale parent-DS at validating resolvers (Quad9 gotcha).** If the domain *previously* had DNSSEC at any point (Squarespace/Google Domains used to enable it automatically for some accounts), the parent `.com` once carried a DS for an older KSK. After removing that DS and gap-publishing a new one (cutover scenario), validating resolvers that happen to have the old DS still in cache will see DNSKEY-vs-DS mismatch and return SERVFAIL until their parent-DS cache TTL expires (up to 24h, since `.com` sets `DS TTL = 86400`). Quad9 was the canary on the millsymills cutover (2026-05-15, issue #481). **Before submitting the new DS, check `dig DS <fqdn> @9.9.9.9 @1.1.1.1 @8.8.8.8 @208.67.222.222` from a few vantage points and note the highest remaining TTL among any DS responses — that's your worst-case SERVFAIL window for the affected resolver's user population.** No public flush mechanism exists for Quad9 / most major resolvers; only path is a support ticket + waiting the TTL. Cloudflare/Google evict aggressively, so most users are fine; Quad9 is sticky.
12. **Decommission Squarespace.** Cancel the plan once you're happy with the new site + email for at least a billing cycle.

## Email (ProtonMail)

Managed in `infra/email.tf`. The config is safe to deploy before Proton is set up — in the "no Proton" state it publishes a null MX (RFC 7505), `v=spf1 -all`, and a strict `DMARC p=reject`, so the domain cannot be spoofed. The `_smtp._tls` TLS-RPT record (RFC 8460) is also published unconditionally — until Proton is live, no remote MTA delivers mail here, so it stays silent until the inbox actually exists. When you're ready to activate email:

1. Sign up for a ProtonMail plan that supports custom domains (Mail Plus and up).
2. In Proton admin → **Settings → Domains**, add `millsymills.com`. Proton gives you a verification token.
3. Put the token in the **per-stack** secrets file at `infra/stacks/<stack>.secrets.tfvars` (gitignored; `scripts/tf.sh` auto-loads it) as `protonmail_verification_token = "..."` and run `terraform apply`. This flips MX to Proton and adds the verification TXT. Do NOT put the token in the shared `infra/terraform.tfvars` if you operate more than one stack from this checkout — that file is auto-loaded for every stack, so one stack's token would silently override the other's on plan and rewrite the live verification TXT with the wrong value on apply (this is exactly the regression #572/#574 closed).
4. Wait for Proton to confirm DNS verification.
5. Proton now shows three DKIM CNAME targets. Add them to the **committed** `infra/stacks/<stack>.tfvars` (the DKIM CNAME *targets* are public-by-virtue-of-being-in-DNS, not secret — see `millsymills.tfvars` for the existing pattern) as `protonmail_dkim_selectors = { protonmail = "...", protonmail2 = "...", protonmail3 = "..." }` and `terraform apply`.
6. Create `dmarc@millsymills.com` and `tls-rpt@millsymills.com` (and whatever other addresses you want) in Proton — these are the rua landing addresses for DMARC aggregate reports and SMTP TLS reports.

DMARC stays at `p=reject; adkim=s; aspf=s` throughout — we deliberately skip the `p=quarantine` training phase because Proton is the only legitimate sender and aligned DKIM/SPF should pass on day one.

### MTA-STS rollout (#134)

Managed in `infra/mta_sts.tf`. The `mta-sts.<domain>` ACM SAN, CloudFront alias, and A/AAAA records ship unconditionally; the `_mta-sts.<domain>` discovery TXT is gated on `var.enable_mta_sts`. The policy file lives at `src/pages/.well-known/mta-sts.txt.ts` and is served from `https://mta-sts.<domain>/.well-known/mta-sts.txt`.

millsymills.com ships `mode: enforce` with `max_age: 604800` (the RFC 8461 §3.2 SHOULD floor) — `enable_mta_sts = true` in `infra/stacks/millsymills.tfvars`. The testing→enforce flip landed via #734 (2026-06-22) after a clean TLS-RPT soak; enforcing senders now refuse delivery to any MX not covered by the policy. `mta_sts_id` in the stack tfvars is the policy version senders cache against.

The flip procedure, for reference (already done for millsymills; reapply only if standing up MTA-STS on another stack, which starts at `mode: testing` and soaks 2-4 weeks of clean TLS-RPT reports first):

1. Edit `src/pages/.well-known/mta-sts.txt.ts`: `mode: enforce`, `max_age: 604800`.
2. Bump `mta_sts_id` in the matching `infra/stacks/<stack>.tfvars` (timestamp). Senders refresh their cached policy when the id changes.
3. Deploy + `terraform apply`. Both must land before senders observe the new policy.

**Reversal in `mode: enforce` is asymmetric.** Publish `mode: none` in the policy file AND wait `max_age` BEFORE setting `enable_mta_sts = false` to drop the TXT record, otherwise enforcing senders refuse delivery during the rollback window. The policy file is what tells senders to back off; the TXT record only controls discovery.

## Deploy workflow

Deploys run via `.github/workflows/deploy.yml` on workflow_dispatch and on a monthly `schedule:` trigger. (The auto-fire-on-push trigger is intentionally commented out so that a code push doesn't deploy on its own — the unattended run cadence is the monthly schedule, not "every merge.") Both target the `production` GitHub Environment for variable scoping.

**Trust model.** As of #144 the repo is on GitHub Pro, so a required-reviewer rule on `production` is now possible — but it's intentionally NOT enabled, because turning it on would block the monthly `schedule:` run on a manual approval and that's the cron that keeps `security.txt`'s `Expires:` field fresh. Runs deploy unattended. The trust boundary is enforced by:

- OIDC `sub` claim pinned to `repo:millsmillsymills/millsymills.com:environment:production` in the IAM role's trust policy.
- OIDC `job_workflow_ref` pinned to `deploy.yml@refs/heads/main` — a tampered workflow file (different name, different branch) cannot mint the deploy role's token.
- The deploy role's IAM policy is scoped to S3 PutObject/DeleteObject/GetObject (plus the ListBucket/GetBucketLocation scaffolding `aws s3 sync` requires) on the prod bucket, and CloudFront `CreateInvalidation`/`GetInvalidation` on its distribution. See `infra/github_oidc.tf` for the exact policy.

A maintainer who can push to `main` could bypass any reviewer gate by approving themselves anyway, so even with Pro the OIDC + IAM-scope model remains the load-bearing protection — a reviewer rule would be hygiene, not the trust anchor.

`deploy.yml`'s monthly `schedule` (1st of each month, 03:00 UTC) keeps `/.well-known/security.txt`'s `Expires:` field — set to build-time + 12 months — from silently going stale. The scheduled run executes unattended (see plan limits above). If you ever want to drop the schedule, security.txt's 12mo `Expires` window leaves plenty of slack to manually re-deploy yearly.

The OIDC trust policy pins each stack's role to a specific workflow file via the `deploy_workflow` Terraform variable (default `deploy.yml`). **If you add a new deploy workflow, add a matching `deploy_workflow = "<file>.yml"` line to the relevant stack's tfvars and `terraform apply` BEFORE pushing the workflow** — otherwise the new workflow's `AssumeRoleWithWebIdentity` call will fail. `ci-local.sh` checks the referenced workflow file exists; a typo there is caught locally.

### One-time setup

1. `./scripts/tf.sh millsymills init && ./scripts/tf.sh millsymills apply` — creates the OIDC provider and the `millsymills-com-github-deploy` IAM role.
2. Grab the role ARN from the Terraform output:
   ```bash
   terraform output -raw github_deploy_role_arn
   ```
3. In GitHub repo settings → **Environments → production**: create the environment if it doesn't exist. The repo is on GitHub Pro (#144), so required-reviewer protection is available — currently left off so the monthly `schedule:` deploy can run unattended (see Trust model above). Optionally restrict the deployment branch policy to `main`.
4. In GitHub repo settings → **Environments → production → Variables**, set these as *environment variables* (not repository-level — scoped per environment):
   - `AWS_DEPLOY_ROLE_ARN` — the ARN from step 2.
   - `AWS_REGION` — `us-west-2` (matches `infra/variables.tf` default and the per-stack tfvars; ACM/DNSSEC pinning to us-east-1 happens inside Terraform via the provider alias regardless).
   - `SITE_DOMAIN` — `millsymills.com`.
   - `CLOUDFRONT_DISTRIBUTION_ID` — from `terraform output cloudfront_distribution_id`.
   - `SITE_URL` — `https://millsymills.com`. **Required** — `astro.config.mjs` refuses CI builds that do not set `SITE_URL`.
5. In GitHub repo settings → **Environments → production → Secrets**, set:
   - `BRANCH_PROTECTION_READ_TOKEN` — a fine-grained PAT scoped to **this repo only** with **Repository permissions → Administration: Read** and nothing else. Consumed by the "Verify signed-commits enforcement on main" step in `deploy.yml` (#478) — the default `GITHUB_TOKEN` cannot read `branches/main/protection/required_signatures` regardless of `permissions:` block. See "Secrets and PAT rotation" below for cadence.

### Secrets and PAT rotation

Two human-rotated PATs / tokens live outside Terraform:

| Where | Name | Scope | Used by | Rotation |
|---|---|---|---|---|
| Production env secret | `BRANCH_PROTECTION_READ_TOKEN` | Fine-grained PAT, this repo only, `Administration: Read` | `deploy.yml` signed-commits drift check | Yearly; on PAT expiry the next deploy fails loudly with HTTP 403 — mint a replacement and re-paste |
| Local shell | `TF_VAR_github_token` (or `gh auth token`) | Whatever your `gh auth login` carries (broad) | `infra/main.tf` GitHub provider for `terraform apply` | When `gh auth status` says expired |

PAT mint flow (BRANCH_PROTECTION_READ_TOKEN):
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Resource owner: your user. Repository access: **Only select repositories** → `millsmillsymills/millsymills.com`. Repository permissions: **Administration: Read** only — no other scopes.
3. Expiration: 1 year (set a calendar reminder).
4. Copy the token, paste into the production environment as `BRANCH_PROTECTION_READ_TOKEN`. Never commit.
5. Verify on the next dispatched deploy: the "Verify signed-commits enforcement on main" step should log `signed-commits enforcement on main: enabled` and the overall job stays green.

### Build-time env vars

- `SITE_URL` (required in CI) — the canonical site URL baked into the build. Must be a valid URL.
- `NO_INDEX=true` — adds noindex to the build. `astro.config.mjs` refuses to build if `NO_INDEX=true` is combined with a `SITE_URL` containing `millsymills.com`, to prevent accidentally shipping a noindexed prod build.

### Manual deploy (fallback)

1. `SITE_URL=https://millsymills.com npm run build` — outputs static files to `dist/`
2. `aws s3 sync dist/ s3://millsymills.com --delete`
3. `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`

### PR + merge convention

- PRs merge via **squash** (`gh pr merge <N> --squash`). Commit messages on `main` follow `<type>(<scope>): <summary> (#<pr>)` as a single squashed line.
- Before filing a PR from a long-lived feature branch: `git merge origin/main` into the branch first so any upstream changes that landed against your work get reviewed + fixed in the same PR, not as a follow-up.

## Agent skills

### Issue tracker

Issues live in GitHub at `millsmillsymills/millsymills.com`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — created lazily on first use. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.
