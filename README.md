# millsymills.com

The source for [millsymills.com](https://millsymills.com) — an Astro static site hosted on AWS, with Terraform for the infrastructure and GitHub Actions for CI/CD.

Released under [MIT](LICENSE) as a community template — fork it, rename it, ship your own personal site on AWS.

## What's in here

- **`src/`** — Astro pages and layouts (`output: 'static'`).
- **`infra/`** — Terraform for S3 (private, OAC-fronted), CloudFront (HTTPS, security headers, directory-index rewrite), Route53 (apex + `www`, IPv4 and IPv6), ACM (us-east-1), IAM OIDC deploy role, and ProtonMail email DNS (SPF/DKIM/DMARC).
- **`.github/workflows/`** — CI (Astro build + typecheck + Terraform fmt/validate) and deploy. Per-PR / per-push CI triggers are currently disabled (run `./scripts/ci-local.sh` locally instead); the deploy workflow runs on `workflow_dispatch` plus a monthly `schedule` so `/.well-known/security.txt`'s 12-month `Expires:` field can't silently go stale. Deploys are unattended on the GitHub free-private plan (which does not support Environment required-reviewer protection); the trust boundary is OIDC `sub` + `job_workflow_ref` pinned to a specific workflow file, plus a tightly-scoped IAM role. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)'s header comment and [`infra/github_oidc.tf`](infra/github_oidc.tf).

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
2. An S3 bucket for Terraform state (e.g. `<domain>-terraform-state`) with versioning and SSE-S3 enabled. The `backend "s3" {}` block in `infra/main.tf` is already wired — all backend fields (bucket, key, region, encrypt, use_lockfile) are supplied per-stack via `terraform init -backend-config=...`. See `infra/stacks/*.backend.hcl`.
3. Terraform 1.10+ installed.

Then, using the stack-aware wrapper (which supplies `-backend-config` for you and refuses to touch the wrong stack):

```bash
./scripts/tf.sh <stack> init    # e.g. ./scripts/tf.sh millsymills init
./scripts/tf.sh <stack> plan
./scripts/tf.sh <stack> apply
```

Stacks are defined under `infra/stacks/`. Forks should add a `<stack>.tfvars` + `<stack>.backend.hcl` pair for their own domain.

See [CLAUDE.md](CLAUDE.md) for the full migration / deploy / email runbook, including:

- Cutting over from an existing host (e.g. Squarespace) to the AWS stack.
- Wiring up the GitHub Actions deploy (OIDC role, env-scoped variables, OIDC sub-claim trust pin).
- Activating ProtonMail custom domain email (verification token → DKIM → mailboxes).

## License

[MIT](LICENSE) — copyright mills, 2026.
