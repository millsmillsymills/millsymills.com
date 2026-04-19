# millsymills.com

Personal/portfolio website. Currently hosted on Squarespace; this repo is the redesigned site that will replace it when migrated to AWS.

## Stack

- **Frontend**: Astro 6 (static output) — `src/` contains pages and components
- **Hosting**: AWS S3 + CloudFront + Route53 + ACM — `infra/` contains Terraform
- **IaC**: Terraform 1.10+

## Key commands

```bash
npm install          # install dependencies
npm run dev          # local dev server (localhost:4321)
npm run build        # build to dist/
npm run preview      # preview the built site
```

```bash
cd infra
terraform init       # first-time or after provider changes
terraform plan       # preview changes
terraform apply      # deploy infrastructure
```

## Terraform notes

- ACM certificate must be provisioned in us-east-1 (CloudFront requirement) — handled via the `aws.us_east_1` provider alias in `main.tf`
- Route53 hosted zone for millsymills.com must exist before running `terraform apply` (data source lookup, not managed)
- S3 bucket is private; CloudFront accesses it via Origin Access Control (OAC). Because OAC talks to the S3 REST endpoint (not the S3 website endpoint), the REST endpoint does not auto-resolve `/some/path/` to `/some/path/index.html`. A CloudFront Function (`infra/cloudfront_function_index.js`, attached as a viewer-request association in `cloudfront.tf`) rewrites directory URIs before they reach the origin — otherwise every non-root Astro route would 404.
- Backend S3 bucket for state (`millsymills-terraform-state`) must be created manually before uncommenting the `backend` block in `main.tf`. Enable bucket versioning and SSE-S3 on it. The backend uses `encrypt = true` and S3-native state locking (`use_lockfile = true`), which requires Terraform >= 1.10.

## Migration runbook (Squarespace → AWS)

One-shot cutover checklist. Do these roughly in order; the email steps (Proton) can run in parallel with the web steps.

1. **State bucket.** Create the S3 bucket for Terraform state (default name `millsymills-terraform-state`) in the AWS console — versioning on, SSE-S3 on, public access blocked. Uncomment the `backend "s3"` block in `infra/main.tf`.
2. **Hosted zone.** In Route53, create a public hosted zone for `millsymills.com`. Do **not** update registrar nameservers yet.
3. **tfvars.** Copy `infra/terraform.tfvars.example` → `infra/terraform.tfvars` and fill in `github_repo` (required) and any Proton values you already have.
4. **First apply.** `cd infra && terraform init && terraform apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy.
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

### One-time setup

1. `cd infra && terraform apply` — creates the OIDC provider and the `millsymills-com-github-deploy` IAM role.
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

### Manual deploy (fallback)

1. `npm run build` — outputs static files to `dist/`
2. `aws s3 sync dist/ s3://millsymills.com --delete`
3. `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`
