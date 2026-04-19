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

```bash
./scripts/ci-local.sh  # run the full CI suite locally (node + terraform)
```

## Terraform notes

- ACM certificate must be provisioned in us-east-1 (CloudFront requirement) — handled via the `aws.us_east_1` provider alias in `main.tf`
- Route53 hosted zone for millsymills.com must exist before running `terraform apply` (data source lookup, not managed)
- S3 bucket is private; CloudFront accesses it via Origin Access Control (OAC)
- Backend S3 bucket for state (`millsymills-terraform-state`) must be created manually before uncommenting the `backend` block in `main.tf`. Enable bucket versioning and SSE-S3 on it. The backend uses `encrypt = true` and S3-native state locking (`use_lockfile = true`), which requires Terraform >= 1.10.

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
