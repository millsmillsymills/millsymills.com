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
- **Motif utilities** (`.motif-scanlines` + `.motif-scanlines--soft`, `.motif-grain`, `.motif-chrom`) are opt-in texture classes in `desktop.css`. Grain is mounted once via `<div class="motif-grain">` in `DesktopLayout.astro` so it paints above windows but below the taskbar.
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
# For the p41m0n rehearsal stack, substitute `p41m0n` for `millsymills`.
```

```bash
./scripts/ci-local.sh  # run the full CI suite locally (node + terraform)
```

## Terraform notes

- Primary AWS region is `us-west-2` (set in `infra/variables.tf`'s `aws_region` default and reaffirmed per stack in `infra/stacks/<stack>.tfvars`). The state bucket lives in `us-west-2` too — see `infra/stacks/<stack>.backend.hcl`.
- ACM certificate, DNSSEC KMS keys, and CloudFront-logs delivery are pinned to us-east-1 via the `aws.us_east_1` provider alias in `main.tf` (CloudFront / Route53 DNSSEC service constraints). These are unaffected by the primary-region setting.
- Route53 hosted zone for millsymills.com must exist before running `terraform apply` (data source lookup, not managed)
- S3 bucket is private; CloudFront accesses it via Origin Access Control (OAC). Because OAC talks to the S3 REST endpoint (not the S3 website endpoint), the REST endpoint does not auto-resolve `/some/path/` to `/some/path/index.html`. A CloudFront Function (`infra/cloudfront_function_index.js`, attached as a viewer-request association in `cloudfront.tf`) rewrites directory URIs before they reach the origin — otherwise every non-root Astro route would 404.
- Backend S3 bucket for state (`millsymills-terraform-state`, in `us-west-2`) must be created manually with versioning + SSE-S3 enabled. The `backend "s3" {}` block in `main.tf` is intentionally empty — all fields (bucket, key, region, encrypt, use_lockfile) come from `infra/stacks/<stack>.backend.hcl` via `terraform init -backend-config=...`, wired up by `scripts/tf.sh`. Uses `encrypt = true` and S3-native state locking (`use_lockfile = true`), requiring Terraform >= 1.10.

## Migration runbook (Squarespace → AWS)

One-shot cutover checklist. Do these roughly in order; the email steps (Proton) can run in parallel with the web steps.

1. **State bucket.** Create the S3 bucket for Terraform state (default name `millsymills-terraform-state`) in `us-west-2` via the AWS console — versioning on, SSE-S3 on, public access blocked. Both stacks (millsymills + p41m0n) share this bucket via distinct keys, so it only needs creating once. The `backend "s3" {}` block in `infra/main.tf` is already activated as an empty block; all fields (bucket, key, region, encrypt, use_lockfile) are supplied per-stack via `infra/stacks/<stack>.backend.hcl` at `terraform init` time.
2. **Hosted zone.** In Route53, create a public hosted zone for `millsymills.com`. Do **not** update registrar nameservers yet.
3. **tfvars.** Copy `infra/terraform.tfvars.example` → `infra/terraform.tfvars` and fill in `github_repo` (required) and any Proton values you already have.
4. **Pre-publish ACM validation CNAMEs at the existing registrar.** Targeting `millsymills.com`'s real cutover, the existing registrar is Squarespace (or whatever's authoritative right now per `dig NS millsymills.com`). Step 5's `terraform apply` blocks on `aws_acm_certificate_validation.site`, which polls public DNS for two CNAMEs that AWS auto-generates — but those CNAMEs go into your Route53 zone, which is not yet authoritative. Without breaking the chicken-and-egg first, ACM validation hangs until you cut over, but step 5 can't finish until ACM validates. **The p41m0n.com rehearsal surfaced this gap** — without it, apply hangs ~25 min until your AWS STS token expires, then you debug a credential failure that's actually a DNS chicken-and-egg.
   - **Targeted apply** to materialize the cert + Route53 validation records first (skips CloudFront, which depends on the cert): `./scripts/tf.sh <stack> apply -target=aws_acm_certificate.site -target=aws_route53_record.cert_validation`.
   - **Read the two CNAMEs** AWS expects to see: `aws acm describe-certificate --region us-east-1 --certificate-arn $(terraform -chdir=infra output -raw acm_certificate_arn) --query 'Certificate.DomainValidationOptions[].ResourceRecord'` (or the AWS console). Each record is `{Name, Type=CNAME, Value}`.
   - **Publish both at the existing registrar's DNS.** ~5 min later ACM validation completes via the existing public-DNS path; proceed to step 5.
5. **First apply.** From the repo root: `./scripts/tf.sh millsymills init` then `./scripts/tf.sh millsymills apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy. See `infra/stacks/` for the per-stack config; `./scripts/tf.sh` is the stack-aware wrapper and refuses to touch the wrong state by mistake.
   - **If the apply fails partway through the DNSSEC chain** (KMS key/Route53 KSK provisioning is the slowest, eventual-consistency-prone step in us-east-1), recover by completing the us-east-1 chain first with `./scripts/tf.sh <stack> apply -target=aws_kms_key.dnssec -target=aws_kms_alias.dnssec -target=aws_route53_key_signing_key.ksk -target=aws_route53_hosted_zone_dnssec.site`, then re-run the full apply.
   - **If your AWS auth gives short-lived STS tokens** (e.g., the `aws-login` SSO plugin issues ~15-min tokens by default), a single-shot `apply` will outlast the token TTL and fail mid-run with `ExpiredToken` on the final state save plus possibly leaving a stale state lock. Recovery is idempotent: re-export creds with `eval "$(aws configure export-credentials --format env-no-export | sed 's/^/export /')"`, force-unlock with `./scripts/tf.sh <stack> force-unlock -force <ID>` (lock ID is in the error output), and re-run apply. Each iteration converges (state has fewer resources to create). Better long-term: switch to `aws-vault exec` or a profile with longer-lived credentials so apply doesn't need the resume dance.
6. **Smoke test via CloudFront domain.** `terraform output cloudfront_domain` gives you `d1234abcd.cloudfront.net`. Put a single test file at `s3://millsymills.com/index.html` (or build + `aws s3 sync`) and confirm `https://d1234abcd.cloudfront.net/` serves it. Validates CloudFront + OAC + S3 before DNS cutover.
7. **Wire up GitHub Actions.** Configure the `production` environment with required reviewers, set the four repo variables (see "Deploy workflow" below), push to `main`, approve the run. Confirm `dist/` is live at the CloudFront domain.
8. **Registrar cutover.** At the domain registrar, replace the nameserver records with the four NS records from `terraform output` (or from the Route53 hosted zone page). This is the point of no return. Downtime window depends on the OLD nameserver TTL; for squarespace.com → Route53, usually <1 hour.
9. **Verify.** Once the NS change propagates:
   - `https://millsymills.com/` serves the new site.
   - `https://www.millsymills.com/` serves the new site.
   - Both resolve over IPv4 and IPv6 (`dig A` and `dig AAAA`).
   - `curl --tlsv1.3 --tls-max 1.3 -I https://millsymills.com/` succeeds (TLS 1.3-only floor is enforced).
   - `curl -I https://millsymills.com/` shows HSTS, CSP, X-Content-Type-Options, Referrer-Policy, COOP/COEP/CORP.
   - `openssl s_client -connect millsymills.com:443 -groups X25519MLKEM768 </dev/null 2>/dev/null | grep "Server Temp Key"` returns `Server Temp Key: X25519MLKEM768` (post-quantum hybrid KEX is negotiating; requires openssl ≥ 3.5 client-side).
10. **Email activation.** Follow the ProtonMail runbook below — independent of web, can happen before or after.
11. **DNSSEC chain at registrar.** Route53 starts signing on first apply (#125), but the parent zone (`.com`) only enforces validation once a DS record is published at the registrar. Order matters — getting it wrong takes ~50% of the world's resolvers offline until parent-TTL expires. See `infra/dnssec.tf` for the full ordering; the short version: confirm signing is live with `dig +dnssec @ns-XXX.awsdns-XX.com millsymills.com`, then paste `terraform output -raw dnssec_ds_record` into the registrar's DS field, then verify a green run on https://dnsviz.net/d/millsymills.com/dnssec/. **Reversal is asymmetric: REMOVE the DS record at the registrar FIRST and wait the parent TTL BEFORE disabling signing in Terraform**, or the zone goes BOGUS for validating resolvers.
12. **Decommission Squarespace.** Cancel the plan once you're happy with the new site + email for at least a billing cycle.

## Dress rehearsal on p41m0n.com

Before running the migration above on millsymills.com, the same runbook is rehearsed end-to-end against `p41m0n.com`. See `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md` for the plan. Key lessons the rehearsal locks in for the real cutover:

- **Parent-zone delegation TTL governs NS rollback**, not record TTLs. A bad NS flip takes up to ~48h to fully roll back for `.com` — plan to fix-forward rather than flip-back. Validate exhaustively before the real flip.
- **ACM cert validation is a chicken-and-egg with the cutover.** Step 4 of the runbook above (pre-publish ACM CNAMEs at the existing registrar) was added because the rehearsal's first apply hung ~25 min on `aws_acm_certificate_validation.site` — AWS publishes the validation CNAMEs to your new Route53 zone, but until you cut over, the world's resolvers ask the OLD registrar and never see them. Targeted `apply` first, then publish CNAMEs at the existing registrar, then resume.
- **Short-lived STS tokens force iterative apply.** A typical SSO/aws-login plugin issues ~15-min tokens. A clean apply takes 15-20 min mostly waiting on CloudFront. Plan for at least one credential refresh + force-unlock + resume cycle, or switch to longer-lived credentials before the real run. Apply is idempotent so iteration converges; just budget the wallclock.
- Run `./scripts/tf.sh p41m0n ...` for the rehearsal stack, `./scripts/tf.sh millsymills ...` for the real one. Never pass a stack name the wrapper doesn't recognize.

## Email (ProtonMail)

Managed in `infra/email.tf`. The config is safe to deploy before Proton is set up — in the "no Proton" state it publishes a null MX (RFC 7505), `v=spf1 -all`, and a strict `DMARC p=reject`, so the domain cannot be spoofed. The `_smtp._tls` TLS-RPT record (RFC 8460) is also published unconditionally — until Proton is live, no remote MTA delivers mail here, so it stays silent until the inbox actually exists. When you're ready to activate email:

1. Sign up for a ProtonMail plan that supports custom domains (Mail Plus and up).
2. In Proton admin → **Settings → Domains**, add `millsymills.com`. Proton gives you a verification token.
3. Put the token in `infra/terraform.tfvars` as `protonmail_verification_token = "..."` and run `terraform apply`. This flips MX to Proton and adds the verification TXT.
4. Wait for Proton to confirm DNS verification.
5. Proton now shows three DKIM CNAME targets. Add them to `terraform.tfvars` as `protonmail_dkim_selectors = { protonmail = "...", protonmail2 = "...", protonmail3 = "..." }` and `terraform apply`.
6. Create `dmarc@millsymills.com` and `tls-rpt@millsymills.com` (and whatever other addresses you want) in Proton — these are the rua landing addresses for DMARC aggregate reports and SMTP TLS reports.

DMARC stays at `p=reject; adkim=s; aspf=s` throughout — we deliberately skip the `p=quarantine` training phase because Proton is the only legitimate sender and aligned DKIM/SPF should pass on day one.

## Deploy workflow

Deploys run via `.github/workflows/deploy.yml` on every push to `main`, but the workflow targets the `production` GitHub Environment, which **must be configured with required reviewers**. GitHub holds each run in a "Waiting" state until a human approves it — so nothing ships to AWS without an explicit click, even if a push lands on `main`.

The parallel `deploy-rehearsal.yml` workflow ships the same build to the `p41m0n` rehearsal stack via the `rehearsal` environment. Keep the two workflows in sync when changing CI — the rehearsal exists to catch deploy-pipeline bugs before they hit prod.

`deploy.yml` also fires on a monthly `schedule` (1st of each month, 03:00 UTC). The point is to keep `/.well-known/security.txt`'s `Expires:` field — set to build-time + 12 months — from silently going stale. Each scheduled run still hits the `production` environment's required-reviewer gate, so it surfaces as a once-a-month "approve a no-op rebuild" notification rather than running unattended. If the cron ever gets noisy or expensive, drop the `schedule:` trigger from `deploy.yml`; security.txt's 12mo `Expires` window leaves plenty of slack to bring it back later.

The OIDC trust policy pins each stack's role to a specific workflow file via the `deploy_workflow` Terraform variable. Default is `deploy.yml`; the rehearsal stack overrides to `deploy-rehearsal.yml` in `infra/stacks/p41m0n.tfvars`. **If you add a new deploy workflow, add a matching `deploy_workflow = "<file>.yml"` line to the relevant stack's tfvars and `terraform apply` BEFORE pushing the workflow** — otherwise the new workflow's `AssumeRoleWithWebIdentity` call will fail. `ci-local.sh` checks the referenced workflow file exists; a typo there is caught locally.

### One-time setup

1. `./scripts/tf.sh millsymills init && ./scripts/tf.sh millsymills apply` — creates the OIDC provider and the `millsymills-com-github-deploy` IAM role.
2. Grab the role ARN from the Terraform output:
   ```bash
   terraform output -raw github_deploy_role_arn
   ```
3. In GitHub repo settings → **Environments → production**:
   - Add at least one **required reviewer** (yourself).
   - Optionally scope the environment to `main` only.
4. In GitHub repo settings → **Variables**, set these as *repository variables* (not secrets — they're not sensitive):
   - `AWS_DEPLOY_ROLE_ARN` — the ARN from step 2.
   - `AWS_REGION` — `us-west-2` (matches `infra/variables.tf` default and the per-stack tfvars; ACM/DNSSEC pinning to us-east-1 happens inside Terraform via the provider alias regardless).
   - `SITE_DOMAIN` — `millsymills.com`.
   - `CLOUDFRONT_DISTRIBUTION_ID` — from `terraform output cloudfront_distribution_id`.
   - `SITE_URL` — `https://millsymills.com` (or equivalent for the `rehearsal` environment: `https://p41m0n.com`). **Required** — `astro.config.mjs` refuses CI builds that do not set `SITE_URL`.

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
