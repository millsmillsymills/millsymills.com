# millsymills.com

Personal/portfolio website. Currently hosted on Squarespace; this repo is the redesigned site that will replace it when migrated to AWS.

## Stack

- **Frontend**: Astro 6 (static output) — `src/` contains pages and components
- **Hosting**: AWS S3 + CloudFront + Route53 + ACM — `infra/` contains Terraform
- **IaC**: Terraform 1.10+

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

## Key commands

```bash
npm install          # install dependencies
npm run dev          # local dev server (localhost:4321)
npm run build        # build to dist/
npm run preview      # preview the built site
```

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

- ACM certificate must be provisioned in us-east-1 (CloudFront requirement) — handled via the `aws.us_east_1` provider alias in `main.tf`
- Route53 hosted zone for millsymills.com must exist before running `terraform apply` (data source lookup, not managed)
- S3 bucket is private; CloudFront accesses it via Origin Access Control (OAC). Because OAC talks to the S3 REST endpoint (not the S3 website endpoint), the REST endpoint does not auto-resolve `/some/path/` to `/some/path/index.html`. A CloudFront Function (`infra/cloudfront_function_index.js`, attached as a viewer-request association in `cloudfront.tf`) rewrites directory URIs before they reach the origin — otherwise every non-root Astro route would 404.
- Backend S3 bucket for state (`millsymills-terraform-state`) must be created manually before uncommenting the `backend` block in `main.tf`. Enable bucket versioning and SSE-S3 on it. The backend uses `encrypt = true` and S3-native state locking (`use_lockfile = true`), which requires Terraform >= 1.10.

## Migration runbook (Squarespace → AWS)

One-shot cutover checklist. Do these roughly in order; the email steps (Proton) can run in parallel with the web steps.

1. **State bucket.** Create the S3 bucket for Terraform state (default name `millsymills-terraform-state`) in the AWS console — versioning on, SSE-S3 on, public access blocked. The `backend "s3" {}` block in `infra/main.tf` is already activated as an empty block; all fields (bucket, key, region, encrypt, use_lockfile) are supplied per-stack via `infra/stacks/<stack>.backend.hcl` at `terraform init` time.
2. **Hosted zone.** In Route53, create a public hosted zone for `millsymills.com`. Do **not** update registrar nameservers yet.
3. **tfvars.** Copy `infra/terraform.tfvars.example` → `infra/terraform.tfvars` and fill in `github_repo` (required) and any Proton values you already have.
4. **First apply.** From the repo root: `./scripts/tf.sh millsymills init` then `./scripts/tf.sh millsymills apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy. See `infra/stacks/` for the per-stack config; `./scripts/tf.sh` is the stack-aware wrapper and refuses to touch the wrong state by mistake.
5. **Smoke test via CloudFront domain.** `terraform output cloudfront_domain` gives you `d1234abcd.cloudfront.net`. Put a single test file at `s3://millsymills.com/index.html` (or build + `aws s3 sync`) and confirm `https://d1234abcd.cloudfront.net/` serves it. Validates CloudFront + OAC + S3 before DNS cutover.
6. **Wire up GitHub Actions.** Configure the `production` environment with required reviewers, set the four repo variables (see "Deploy workflow" below), push to `main`, approve the run. Confirm `dist/` is live at the CloudFront domain.
7. **Registrar cutover.** At the domain registrar, replace the nameserver records with the four NS records from `terraform output` (or from the Route53 hosted zone page). This is the point of no return. Downtime window depends on the OLD nameserver TTL; for squarespace.com → Route53, usually <1 hour.
8. **Verify.** Once the NS change propagates:
   - `https://millsymills.com/` serves the new site.
   - `https://www.millsymills.com/` serves the new site.
   - Both resolve over IPv4 and IPv6 (`dig A` and `dig AAAA`).
   - `curl -I https://millsymills.com/` shows HSTS, CSP, X-Content-Type-Options, Referrer-Policy.
9. **Email activation.** Follow the ProtonMail runbook below — independent of web, can happen before or after.
10. **Decommission Squarespace.** Cancel the plan once you're happy with the new site + email for at least a billing cycle.

## Dress rehearsal on p41m0n.com

Before running the migration above on millsymills.com, the same runbook is rehearsed end-to-end against `p41m0n.com`. See `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md` for the plan. Key lessons the rehearsal locks in for the real cutover:

- **Parent-zone delegation TTL governs NS rollback**, not record TTLs. A bad NS flip takes up to ~48h to fully roll back for `.com` — plan to fix-forward rather than flip-back. Validate exhaustively before the real flip.
- Run `./scripts/tf.sh p41m0n ...` for the rehearsal stack, `./scripts/tf.sh millsymills ...` for the real one. Never pass a stack name the wrapper doesn't recognize.

## Email (ProtonMail)

Managed in `infra/email.tf`. The config is safe to deploy before Proton is set up — in the "no Proton" state it publishes a null MX (RFC 7505), `v=spf1 -all`, and a strict `DMARC p=reject`, so the domain cannot be spoofed. When you're ready to activate email:

1. Sign up for a ProtonMail plan that supports custom domains (Mail Plus and up).
2. In Proton admin → **Settings → Domains**, add `millsymills.com`. Proton gives you a verification token.
3. Put the token in `infra/terraform.tfvars` as `protonmail_verification_token = "..."` and run `terraform apply`. This flips MX to Proton and adds the verification TXT.
4. Wait for Proton to confirm DNS verification.
5. Proton now shows three DKIM CNAME targets. Add them to `terraform.tfvars` as `protonmail_dkim_selectors = { protonmail = "...", protonmail2 = "...", protonmail3 = "..." }` and `terraform apply`.
6. Create `dmarc@millsymills.com` (and whatever other addresses you want) in Proton.

DMARC stays at `p=reject; adkim=s; aspf=s` throughout — we deliberately skip the `p=quarantine` training phase because Proton is the only legitimate sender and aligned DKIM/SPF should pass on day one.

## Deploy workflow

Deploys run via `.github/workflows/deploy.yml` on every push to `main`, but the workflow targets the `production` GitHub Environment, which **must be configured with required reviewers**. GitHub holds each run in a "Waiting" state until a human approves it — so nothing ships to AWS without an explicit click, even if a push lands on `main`.

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
   - `AWS_REGION` — e.g. `us-east-1`.
   - `SITE_DOMAIN` — `millsymills.com`.
   - `CLOUDFRONT_DISTRIBUTION_ID` — from `terraform output cloudfront_distribution_id`.
   - `SITE_URL` — `https://millsymills.com` (or equivalent for the `rehearsal` environment: `https://p41m0n.com`). **Required** — `astro.config.mjs` refuses CI builds that do not set `SITE_URL`.

### Manual deploy (fallback)

1. `SITE_URL=https://millsymills.com npm run build` — outputs static files to `dist/`
2. `aws s3 sync dist/ s3://millsymills.com --delete`
3. `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`
