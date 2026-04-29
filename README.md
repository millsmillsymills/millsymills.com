# millsymills.com

The source for [millsymills.com](https://millsymills.com) — an Astro static site hosted on AWS, with Terraform for the infrastructure and GitHub Actions for CI/CD.

Released under [MIT](LICENSE) as a community template — fork it, rename it, ship your own personal site on AWS.

## What's in here

- **`src/`** — Astro pages and layouts (`output: 'static'`).
- **`infra/`** — Terraform for S3 (private, OAC-fronted), CloudFront (HTTPS, security headers, directory-index rewrite), Route53 (apex + `www`, IPv4 and IPv6), ACM (us-east-1), IAM OIDC deploy role, and ProtonMail email DNS (SPF/DKIM/DMARC).
- **`.github/workflows/`** — CI runs on PRs (Astro build + typecheck + Terraform fmt/validate); deploy runs only after CI passes and requires a manual approval via a GitHub Environment.

## Quick start (develop)

```bash
npm install
npm run dev      # localhost:4321
npm run build    # static output to dist/
npm run preview  # preview the built site
npx astro check  # typecheck Astro files
```

Node 22+ required.

## Quick start (infrastructure)

One-time prerequisites:

1. A Route53 public hosted zone for your domain (created manually; Terraform reads it via a data source).
2. An S3 bucket for Terraform state (e.g. `<domain>-terraform-state`) with versioning and SSE-S3 enabled. Uncomment the `backend "s3"` block in `infra/main.tf` once it exists.
3. Terraform 1.10+ installed.

Then:

```bash
cd infra
terraform init
terraform plan
terraform apply
```

See [CLAUDE.md](CLAUDE.md) for the full migration / deploy / email runbook, including:

- Cutting over from an existing host (e.g. Squarespace) to the AWS stack.
- Wiring up the GitHub Actions deploy (OIDC role, env-scoped variables, OIDC sub-claim trust pin).
- Activating ProtonMail custom domain email (verification token → DKIM → mailboxes).

## License

[MIT](LICENSE) — copyright mills, 2026.
