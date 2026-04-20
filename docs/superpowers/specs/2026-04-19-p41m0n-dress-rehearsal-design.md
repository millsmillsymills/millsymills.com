# p41m0n.com AWS deployment — dress rehearsal for millsymills.com

**Status:** draft design, 2026-04-19
**Goal:** run the full millsymills.com AWS deployment runbook against `p41m0n.com` end-to-end — registrar cutover included — to surface problems before doing the real migration. Tear down after.

## Why

The millsymills.com migration runbook (`CLAUDE.md`) is untested. The riskiest step is the registrar nameserver cutover from Squarespace → Route53, because a broken cutover breaks the live site. `p41m0n.com` is a low-traffic domain registered at Gandi with no production email use — a suitable stand-in. After rehearsal, p41m0n is torn down and restored to its pre-rehearsal Gandi state.

## Domain state at time of writing

Confirmed via Gandi MCP queries:

- **`p41m0n.com`** — registered at Gandi, auto-renew on, Gandi LiveDNS active. Current records: apex A → `99.67.236.111`, `www` CNAME → `webredir.vip.gandi.net.`, MX + three DKIM CNAMEs + SRV for Gandi mail, a stray `test` A → `1.2.3.4`. Nameservers: `ns-188-a.gandi.net`, `ns-40-b.gandi.net`, `ns-43-c.gandi.net`.
- **`millsymills.com`** — not present in this Gandi account (Gandi API returns 404). Consistent with `CLAUDE.md`: currently on Squarespace.
- The user does not use `p41m0n@` email. The rehearsal may null-MX it.

## Design decisions (already made during brainstorming)

1. **Shape:** full dress rehearsal (option A) — same `dist/`, same Terraform, real registrar cutover. Tear down after.
2. **Email:** null-MX + strict DMARC, same as millsymills pre-Proton state.
3. **Content:** real Astro site with `<meta name="robots" content="noindex,nofollow">` and a rehearsal-mode `robots.txt`.
4. **Terraform structure:** single root in `infra/`, switch stacks via `-var-file=` + backend key override, fronted by a wrapper script.
5. **CI/CD:** new `deploy-rehearsal.yml` (manual `workflow_dispatch`) targeting a new `rehearsal` GitHub Environment.

## Architecture

One Terraform codebase, two stacks, separated only by state. The code path run against p41m0n is byte-for-byte the path that will later run against millsymills — so anything that works for p41m0n will work for millsymills, modulo content.

### Repo changes

```
infra/
  stacks/
    millsymills.tfvars          (new) — domain, github_repo, protonmail vars
    p41m0n.tfvars               (new) — domain = p41m0n.com, rehearsal values
    millsymills.backend.hcl     (new) — key = millsymills.com/terraform.tfstate
    p41m0n.backend.hcl          (new) — key = p41m0n.com/terraform.tfstate
scripts/
  tf.sh                         (new) — stack-aware terraform wrapper
  gandi-snapshot.sh             (new) — dump Gandi zone JSON for rollback
  verify-p41m0n.sh              (new) — post-cutover verification
.github/workflows/
  deploy-rehearsal.yml          (new) — workflow_dispatch-only, rehearsal env
astro.config.mjs                (edit) — SITE_URL from env with millsymills default
src/…/<head partial>            (edit) — emit noindex meta when NO_INDEX=true
public/robots.txt               (keep) — plus a rehearsal-mode override mechanism
docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md (this file)
```

Nothing in `infra/*.tf` changes structurally. The only new Terraform-visible thing is two tfvars files plus two backend-config files.

### `scripts/tf.sh` contract

- Usage: `./scripts/tf.sh <stack> <terraform-args...>` where `<stack>` is `millsymills` or `p41m0n`. Any other stack value is a hard refusal.
- Auto-runs `terraform -chdir=infra init -reconfigure -backend-config=stacks/<stack>.backend.hcl` on first invocation per stack.
- Prepends `-var-file=stacks/<stack>.tfvars` to `plan` / `apply` / `destroy` / `refresh`.
- Echoes the active stack + state key before every command as a footgun guard.
- Never accepts an implicit/default stack — you must name it every call.

### State

Both stacks' state lives in the same S3 bucket (`millsymills-terraform-state`) under distinct keys. State bucket is created manually per the existing runbook in `CLAUDE.md` — no change there.

### Per-stack resources (unchanged from current code)

- S3 bucket named `<domain>` (private, OAC-gated)
- CloudFront distribution + CloudFront Function (`infra/cloudfront_function_index.js`) for `/foo/` → `/foo/index.html` directory-index rewriting
- ACM certificate in `us-east-1` (DNS-validated via Route53)
- Route53 ALIAS records for apex + www (A + AAAA), plus cert-validation CNAMEs
- IAM deploy role — name already templated as `${replace(var.domain, ".", "-")}-github-deploy` in `infra/github_oidc.tf`, so `p41m0n-com-github-deploy` is produced for free
- Email DNS records — null-MX + `v=spf1 -all` + `DMARC p=reject` (same as millsymills pre-Proton state)

### Resources created manually per stack (unchanged)

- Route53 hosted zone (Terraform only looks it up via `data`)
- Terraform state bucket (`millsymills-terraform-state`) — already exists for millsymills; reused for p41m0n

## Build pipeline

The same `npm run build` needs to produce either a millsymills-canonical indexed build or a p41m0n-canonical noindexed build, depending on environment.

### `astro.config.mjs`

```js
site: process.env.SITE_URL ?? 'https://millsymills.com',
```

Keeps the existing default so bare `npm run build` behaves as today, unblocking casual local work.

### Noindex mechanism

Env-var `NO_INDEX=true` triggers two things:

1. The shared `<head>` partial emits `<meta name="robots" content="noindex,nofollow">`.
2. `public/robots.txt` is overridden at build time with `User-agent: *` + `Disallow: /`. Mechanism TBD during implementation — either a small Astro integration or a `prebuild` script that rewrites the file into `dist/`. Pick whichever is more idiomatic for the current Astro project shape.

### Build-time assertion

If `NO_INDEX=true` is set but `SITE_URL` contains `millsymills.com`, fail the build. Prevents accidentally deploying a noindexed build to the real site if someone wires CI variables wrong.

### Out of scope

No content, component, styling, CSP, or header changes. The rehearsal tests deployment, not content.

## Deploy pipeline

### `.github/workflows/deploy-rehearsal.yml`

- Trigger: `workflow_dispatch` only.
- Environment: `rehearsal` (new GitHub Environment, required reviewer = repo owner).
- Environment-scoped repo variables:
  - `AWS_DEPLOY_ROLE_ARN` → `p41m0n-com-github-deploy` ARN (from `./scripts/tf.sh p41m0n output github_deploy_role_arn`)
  - `AWS_REGION` → `us-east-1`
  - `SITE_DOMAIN` → `p41m0n.com`
  - `SITE_URL` → `https://p41m0n.com`
  - `CLOUDFRONT_DISTRIBUTION_ID` → from Terraform output
  - `NO_INDEX` → `true`
- Steps identical to `deploy.yml`: checkout, `npm ci`, `npm run build` (with the env above), `aws s3 sync dist/ s3://p41m0n.com --delete`, CloudFront invalidation `--paths "/*"`.

### Why not a matrix in `deploy.yml`

A matrix would couple rehearsal deploys to every push to `main`. Rehearsal should be deliberate: separate workflow, manual trigger.

### OIDC trust scope

The trust policy on `p41m0n-com-github-deploy` is the same as millsymills: `repo:<github_repo>:ref:refs/heads/main`. Its IAM policy is scoped to the p41m0n bucket + p41m0n CloudFront only, so even if the wrong workflow somehow assumed the wrong role, it cannot touch the other site.

## DNS cutover sequence for p41m0n

Ordered so that the site is never broken for more than the user-controlled TTL and every step has a clean rollback.

### Pre-cutover (Gandi is still authoritative)

1. **Lower Gandi TTLs.** In Gandi LiveDNS, drop apex A and `www` CNAME TTLs from 10800s (3h) to 300s. Wait 3h for the old TTL to age out. Biggest single risk-reducer: if we roll back after the NS flip, recovery is minutes not hours.
2. **Snapshot Gandi zone.** `./scripts/gandi-snapshot.sh p41m0n.com > .local/gandi-p41m0n-pre-cutover.json`. Script calls the Gandi LiveDNS API directly (`curl` + `GANDI_API_KEY` env var) and dumps every rrset. Not via MCP — MCP is for interactive use, a rollback source of truth should not depend on Claude Code being attached. `.local/` is git-ignored.
3. **Create Route53 hosted zone** for `p41m0n.com` (AWS console).
4. **First Terraform apply.** `./scripts/tf.sh p41m0n init`, then `./scripts/tf.sh p41m0n apply`. Takes ~15–20 min (ACM + CloudFront). Result: cert `ISSUED`, CloudFront `Deployed`, Route53 records in place, null-MX + strict DMARC published. **Nothing public yet** — registrar still points at Gandi.
5. **Smoke test via CloudFront domain.** Sync `dist/` to `s3://p41m0n.com`, invalidate, hit `https://<dist-id>.cloudfront.net/` directly. Click through several pages. Confirm CloudFront Function directory-index rewrites work (`/about/`, etc.). Confirm `<meta robots noindex>` is present and `/robots.txt` is the rehearsal version.
6. **Dress-rehearse the CI deploy.** Manually trigger `deploy-rehearsal.yml`, approve the `rehearsal` environment prompt, confirm the workflow deploys successfully via OIDC. Still accessed via CloudFront domain.

### Cutover

7. **Flip nameservers at Gandi registrar.** In Gandi's registrar UI for `p41m0n.com` → Nameservers, replace the Gandi nameservers with the four Route53 NS records from `./scripts/tf.sh p41m0n output route53_nameservers` (or the hosted-zone page). Point of no return for this phase. Because Gandi TTLs were pre-lowered, propagation is minutes-to-tens-of-minutes.

### Post-cutover verification (`scripts/verify-p41m0n.sh`)

8. After propagation, run the verify script. All of these must pass:
   - `dig +short NS p41m0n.com` returns only Route53 nameservers
   - `dig A p41m0n.com` and `dig AAAA p41m0n.com` both resolve to CloudFront
   - `https://p41m0n.com/` and `https://www.p41m0n.com/` both serve the site over HTTPS with a valid cert
   - `curl -sI https://p41m0n.com/` shows `Strict-Transport-Security`, a `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`
   - `curl -sI https://p41m0n.com/about/` (or another known page) returns `200`, not `404` — validates the CloudFront Function directory-index rewrite
   - `curl -s https://p41m0n.com/robots.txt` is the rehearsal-mode disallow-all
   - HTML source contains `<meta name="robots" content="noindex,nofollow">`
   - `dig MX p41m0n.com` is `.` (null MX per RFC 7505), `dig TXT p41m0n.com` shows `v=spf1 -all` and a DMARC record with `p=reject`

### Rollback (if anything in 7–8 fails)

9. Flip registrar NS back to the captured Gandi values (`ns-188-a.gandi.net`, `ns-40-b.gandi.net`, `ns-43-c.gandi.net`). Gandi LiveDNS records are untouched — p41m0n returns to its pre-rehearsal state within minutes thanks to the pre-lowered TTLs. Diagnose the failure offline, then retry.

## Acceptance criteria

The rehearsal passes if, end-to-end:

1. `./scripts/tf.sh p41m0n apply` completes cleanly from a fresh state with no manual patching.
2. `deploy-rehearsal.yml` deploys successfully via OIDC, gated by the `rehearsal` environment's required-reviewer.
3. All verification checks in the post-cutover step pass.
4. `./scripts/tf.sh millsymills plan` is unaffected by any of the rehearsal work (state fully separated).

Anything that fails in 1–4 is a latent bug in the shared millsymills runbook. Fix it in the shared code, re-apply p41m0n, re-verify.

## Run duration

Leave p41m0n running for 3–7 days. Long enough to surface async issues (CloudFront edge propagation oddities, scraper-triggered CSP violations, headers caught by third-party tools).

## Tear-down

1. Flip p41m0n registrar NS back to the captured Gandi values. Route53 remains authoritative until propagation completes; Gandi LiveDNS records are still intact.
2. Wait for NS propagation (short, TTLs are 300s).
3. `./scripts/tf.sh p41m0n destroy` — tears down CloudFront, S3 bucket, ACM cert, Route53 records, IAM role, email DNS records.
4. Delete the Route53 hosted zone for p41m0n in the AWS console (Terraform never managed it).
5. Either delete the `rehearsal` GitHub Environment and `deploy-rehearsal.yml`, or keep them in place disabled for a future re-rehearsal. Decide at tear-down time.
6. Optionally restore Gandi TTLs on p41m0n from 300 → 10800.

## Loopback into the millsymills runbook

Every fix or gotcha found during the rehearsal lands in `infra/` or `CLAUDE.md`'s migration runbook *before* tear-down. Common expected kinds of finding:

- Missing IAM permissions in `github_oidc.tf`
- Astro `site:` / canonical URL surprises
- CloudFront Function edge cases (trailing slashes, dotfiles, case sensitivity)
- CSP violations on real content
- Header misconfigurations
- Ordering issues in the runbook steps

At tear-down, the codebase is strictly better than it was before the rehearsal. That is the ROI.

## What the rehearsal does NOT validate

Honest scope limits:

- **ProtonMail activation** (`protonmail_verification_token`, DKIM selectors) — tested only on the real domain unless you pay for Proton twice.
- **Squarespace → Route53 registrar flip specifically** — p41m0n is Gandi → Route53. The underlying mechanics (NS change, TTL behavior, propagation) are identical, but Squarespace's registrar UI may have its own quirks (e.g., required custom-NS toggle). Flag this as a known gap; mitigation is to read Squarespace's NS-change docs before the real cutover.
- **`millsymills.com` being authoritative at Route53 while Squarespace is authoritative at squarespace.com** — only becomes real at the real cutover.
