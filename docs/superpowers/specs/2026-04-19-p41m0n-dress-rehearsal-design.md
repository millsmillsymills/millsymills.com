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
  main.tf                       (edit) — activate backend "s3" {} as an empty
                                  block; all fields provided per-stack via
                                  -backend-config. REQUIRED for the two-stack
                                  isolation claim below to hold.
  stacks/
    millsymills.tfvars          (new) — domain, github_repo, protonmail vars
    p41m0n.tfvars               (new) — domain = p41m0n.com, rehearsal values
    millsymills.backend.hcl     (new) — bucket, region, key=millsymills.com/terraform.tfstate
    p41m0n.backend.hcl          (new) — bucket, region, key=p41m0n.com/terraform.tfstate
scripts/
  tf.sh                         (new) — stack-aware terraform wrapper
  gandi-snapshot.sh             (new) — dump Gandi zone JSON for rollback
  verify-p41m0n.sh              (new) — post-cutover verification
.github/workflows/
  deploy-rehearsal.yml          (new) — workflow_dispatch-only, rehearsal env
astro.config.mjs                (edit) — SITE_URL from env with millsymills default
src/layouts/BaseLayout.astro    (edit) — emit noindex meta when build-env flag set
src/layouts/DesktopLayout.astro (edit) — emit noindex meta + parameterize 4 JSON-LD URL refs
src/pages/index.astro           (edit) — compute canonical + ogUrl from Astro.site
src/pages/[app].astro           (edit) — compute canonical + ogImage from Astro.site
src/pages/sitemap.xml.ts        (edit) — replace hardcoded SITE const with Astro.site
src/pages/robots.txt.ts         (new)  — replace static public/robots.txt; emits
                                  disallow-all + correct Sitemap: URL per env
public/robots.txt               (delete) — replaced by the endpoint above
docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md (this file)
```

### `scripts/tf.sh` contract

- Usage: `./scripts/tf.sh <stack> <terraform-args...>` where `<stack>` is `millsymills` or `p41m0n`. Any other stack value is a hard refusal.
- On first invocation per stack (and any time the backend key changes), runs `terraform -chdir=infra init -reconfigure -backend-config=stacks/<stack>.backend.hcl`.
- Prepends `-var-file=stacks/<stack>.tfvars` to `plan` / `apply` / `destroy` / `refresh`.
- Echoes the active stack + state key before every command as a footgun guard.
- **Stale-state guard:** before any apply/destroy, reads `infra/.terraform/terraform.tfstate` and confirms the `"backend"` block's `config.key` matches the requested stack's key. If not, refuses to run and instructs the user to re-init. Prevents "ran `./scripts/tf.sh p41m0n apply` after forgetting to re-init from millsymills" → wrong state file, wrong resources touched.
- Never accepts an implicit/default stack — you must name it every call.

### State

Both stacks' state lives in the same S3 bucket (`millsymills-terraform-state`) under distinct keys, both with versioning + SSE-S3 + native S3 locking (`use_lockfile = true`) per the existing bucket's config.

The backend block in `infra/main.tf` is activated as an **empty** `backend "s3" {}` — no inline `bucket`/`key`/`region`/`encrypt`/`use_lockfile`. All of those fields are supplied per-stack via `-backend-config=stacks/<stack>.backend.hcl`. This is the cleanest way to support two stacks out of one codebase without hardcoding either stack's key: Terraform merges the `.hcl` file into the empty block at `init` time.

The state bucket itself is created manually per the existing runbook in `CLAUDE.md` — no change there.

**Consequence for the runbook:** the current `CLAUDE.md` step "Uncomment the `backend "s3"` block in `infra/main.tf`" becomes slightly different: you activate the block as empty and supply all config via `-backend-config` at init. The runbook must be updated at the same time `infra/main.tf` is edited.

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

The same `npm run build` needs to produce either a millsymills-canonical indexed build or a p41m0n-canonical noindexed build, depending on environment. **Noindex alone is not enough** — every URL emitted by the build must point at the correct domain, because robots/noindex directives are best-effort and not honored by every unfurler, scraper, or structured-data consumer.

### `astro.config.mjs`

```js
site: process.env.SITE_URL ?? 'https://millsymills.com',
```

Keeps the existing default so bare `npm run build` behaves as today, unblocking casual local work. `Astro.site` then returns a URL object based on this value, and every URL that the build emits should be derived from `Astro.site` rather than a hardcoded string.

### URL emission sites (exhaustive — all must be parameterized)

Every one of these currently hardcodes `https://millsymills.com/...` and would leak production URLs into a p41m0n rehearsal build if left untouched:

1. **`src/layouts/DesktopLayout.astro`** — four JSON-LD URL refs (`@id: ...#mills`, `url: ...`, `@id: ...#website`, `url: ...`). Derive from `Astro.site`. The `name`, `og:site_name`, and brand copy ("millsymills.com" as a string) are *content/branding* and stay — only URL-valued emissions change.
2. **`src/pages/index.astro`** — `canonical` and `ogUrl` props. Replace with values computed from `Astro.site` and `Astro.url.pathname`.
3. **`src/pages/[app].astro`** — `canonical` and `ogImage` URLs. Replace with values computed from `Astro.site`.
4. **`src/pages/sitemap.xml.ts`** — the `SITE` constant on line 4. Replace with `Astro.site?.href.replace(/\/$/, '')` (or equivalent; `Astro.site` is available in endpoint handlers).
5. **`public/robots.txt`** — the `Sitemap:` line hardcodes `https://millsymills.com/sitemap.xml`. Delete the file; replace with a new `src/pages/robots.txt.ts` endpoint that emits the same content but with `Sitemap: ${Astro.site}sitemap.xml` and conditionally switches to `User-agent: * / Disallow: /` when the rehearsal env flag is set.

### Not changed (content/branding, not URLs)

- `src/pages/og/[app].svg.ts` — the text `"mills · millsymills.com"` burnt into the OG image is a brand signature, not a URL. Leave.
- `src/layouts/DesktopLayout.astro` — `name: 'millsymills.com'`, `og:site_name: 'millsymills.com'`, `description: '...'`. Content.
- `src/pages/404.astro` title, `src/data/profile.ts` email, `src/data/projects.ts` self-reference, `src/components/desktop/apps/Mail.astro` subject. All content.

### Noindex mechanism

Env-var `NO_INDEX=true` drives three independent emissions, all gated on the same flag so you can't half-apply it:

1. **`src/layouts/BaseLayout.astro`** and **`src/layouts/DesktopLayout.astro`** each emit `<meta name="robots" content="noindex,nofollow">` when `import.meta.env.NO_INDEX === 'true'` OR (in BaseLayout's case) the existing per-page `noindex` prop is set. (DesktopLayout currently has no robots meta at all — this adds one.)
2. **`src/pages/robots.txt.ts`** — when `NO_INDEX=true`, emits `User-agent: *` + `Disallow: /` instead of the permissive default, plus the correctly-parameterized `Sitemap:` line.
3. **CloudFront response-headers policy** (future tightening, currently out of scope) — `X-Robots-Tag: noindex, nofollow` as a defense-in-depth for consumers that ignore HTML meta. Flagged here so we don't forget; deferred unless the rehearsal shows leaks.

Accessing build-time env vars in Astro: either expose via `vite.define` in `astro.config.mjs` (`'import.meta.env.NO_INDEX': JSON.stringify(process.env.NO_INDEX)`) or use Astro's built-in `astro:env` if the project's Astro version supports it. Pick whichever fits at implementation time.

### Build-time assertions (run in `astro.config.mjs`)

Fail the build immediately if any of these are true — these are footgun guards, not belt-and-braces:

- `NO_INDEX === 'true'` and `SITE_URL` contains `millsymills.com` → exiting with a non-zero code.
- `SITE_URL` is set but not a valid URL → exit with a descriptive error.
- `SITE_URL` is unset *in CI* (detect via `process.env.CI === 'true'`) → exit. Local dev can still default.

### Out of scope

No styling, CSP, or header changes. The rehearsal tests deployment + URL plumbing, not content or security posture.

## Deploy pipeline

### `.github/workflows/deploy-rehearsal.yml`

- Trigger: `workflow_dispatch` only.
- Environment: `rehearsal` (new GitHub Environment, required reviewer = repo owner).
- Environment-scoped repo variables:
  - `AWS_DEPLOY_ROLE_ARN` → `p41m0n-com-github-deploy` ARN (from `./scripts/tf.sh p41m0n output github_deploy_role_arn`)
  - `AWS_REGION` → `us-west-2`
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

### TTL scope — read this first

Two different TTLs govern DNS behavior during a registrar cutover, and conflating them leads to false rollback promises:

- **Record TTLs** (apex A, `www` CNAME, MX, etc., set inside the authoritative zone) govern how long resolvers cache those records. Lowering these lets you change *record values* quickly — but only while the current nameservers are still authoritative.
- **Parent-zone delegation TTL** (the NS records in the `.com` TLD zone that point at the authoritative nameservers) governs how long resolvers cache the NS delegation itself. This is **set by the parent zone, not by you**; for `.com` it is typically 172800s (48h). This is the TTL that matters when you flip nameservers at the registrar — and it cannot be lowered by you in advance.

Consequence: **an NS flip cannot be rolled back quickly.** If the cutover fails and you flip NS back at the registrar, resolvers that cached the new delegation will continue to hit Route53 for up to the parent TTL before picking up the Gandi NS again. Plan for rollback measured in hours, not minutes.

This is the honest constraint. The rehearsal strategy therefore front-loads validation: nothing is public until exhaustive pre-flip checks pass, because post-flip recovery is slow.

### Pre-cutover (Gandi is still authoritative)

1. **Lower Gandi record TTLs.** In Gandi LiveDNS, drop apex A and `www` CNAME TTLs from 10800s (3h) to 300s. Wait 3h for the old TTL to age out. This **does not** speed up NS rollback (see TTL scope above). It does let us change record values fast while Gandi is still authoritative — useful if step 2's snapshot reveals a need to fix a record before cutover.
2. **Snapshot Gandi zone.** `./scripts/gandi-snapshot.sh p41m0n.com > .local/gandi-p41m0n-pre-cutover.json`. Script calls the Gandi LiveDNS API directly (`curl` + `GANDI_API_KEY` env var) and dumps every rrset. Not via MCP — MCP is for interactive use, a rollback source of truth should not depend on Claude Code being attached. `.local/` is git-ignored.
3. **Create Route53 hosted zone** for `p41m0n.com` (AWS console).
4. **First Terraform apply.** `./scripts/tf.sh p41m0n init`, then `./scripts/tf.sh p41m0n apply`. Takes ~15–20 min (ACM + CloudFront). Result: cert `ISSUED`, CloudFront `Deployed`, Route53 records in place, null-MX + strict DMARC published. **Nothing public yet** — registrar still points at Gandi.
5. **Smoke test via CloudFront domain.** Sync `dist/` to `s3://p41m0n.com`, invalidate, hit `https://<dist-id>.cloudfront.net/` directly. Click through several pages. Confirm CloudFront Function directory-index rewrites work (`/about/`, etc.). Confirm `<meta robots noindex>` is present on every page, `/robots.txt` is the rehearsal disallow-all, canonical/og:url/JSON-LD URLs point at `p41m0n.com`, and `/sitemap.xml` lists `p41m0n.com` URLs only.
6. **Dress-rehearse the CI deploy.** Manually trigger `deploy-rehearsal.yml`, approve the `rehearsal` environment prompt, confirm the workflow deploys successfully via OIDC. Still accessed via CloudFront domain.
7. **Go/no-go gate.** All of 4–6 must have passed with zero manual patching. If anything was patched manually, fix it in code and re-run from step 4. Do not proceed to the flip on a stack that was "fixed by hand."

### Cutover

8. **Flip nameservers at Gandi registrar.** In Gandi's registrar UI for `p41m0n.com` → Nameservers, replace the Gandi nameservers with the four Route53 NS records from `./scripts/tf.sh p41m0n output route53_nameservers` (or the hosted-zone page). This is the point of no return for this phase.
   - Initial propagation is typically **minutes to tens of minutes** as resolvers with no cached delegation pick up the new NS.
   - **Global** propagation (i.e., every resolver converges on Route53) is bounded by the parent-zone delegation TTL, which for `.com` is typically 48h. Plan accordingly: brokenness on one resolver does not automatically mean a bad cutover — it may just be a slow resolver cache. Cross-check with multiple geographically-distributed DNS probes.

### Post-cutover verification (`scripts/verify-p41m0n.sh`)

9. After initial propagation (wait at least 30 minutes, or until `dig @8.8.8.8 NS p41m0n.com` returns Route53), run the verify script. All of these must pass:
   - `dig +short NS p41m0n.com` returns only Route53 nameservers (check against multiple resolvers: `@8.8.8.8`, `@1.1.1.1`, `@9.9.9.9`)
   - `dig A p41m0n.com` and `dig AAAA p41m0n.com` both resolve to CloudFront
   - `https://p41m0n.com/` and `https://www.p41m0n.com/` both serve the site over HTTPS with a valid cert
   - `curl -sI https://p41m0n.com/` shows `Strict-Transport-Security`, a `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`
   - `curl -sI https://p41m0n.com/about/` (or another known page) returns `200`, not `404` — validates the CloudFront Function directory-index rewrite
   - `curl -s https://p41m0n.com/robots.txt` is the rehearsal-mode disallow-all
   - HTML source contains `<meta name="robots" content="noindex,nofollow">`
   - No HTML page emits `https://millsymills.com/` in canonical, og:url, og:image, or JSON-LD — all such URLs are `p41m0n.com`
   - `curl -s https://p41m0n.com/sitemap.xml` lists only `p41m0n.com` URLs
   - `dig MX p41m0n.com` is `.` (null MX per RFC 7505), `dig TXT p41m0n.com` shows `v=spf1 -all` and a DMARC record with `p=reject`

### Rollback

10. **Rollback is slow.** If verification fails after the flip:
    - Option A (preferred): **fix forward.** The state machine is now authoritative in Route53, and Route53-side DNS changes are fast (respecting our Route53 record TTLs, which are short by default). Most failure modes — wrong header, missing file, bad redirect — can be corrected by fixing code + redeploying via `deploy-rehearsal.yml` + invalidating CloudFront. No DNS change needed.
    - Option B (flip NS back): only if the failure is *structural* to the Route53/CloudFront side (e.g., cert failed to issue, CloudFront distribution misconfigured) and fix-forward is not fast enough. Flip registrar NS back to the captured Gandi values (`ns-188-a.gandi.net`, `ns-40-b.gandi.net`, `ns-43-c.gandi.net`). Gandi LiveDNS records are still intact. Expect partial rollback within minutes-to-hours for resolvers with short NS caches, and **up to 48h for some resolvers** to stop hitting Route53.
    - During any NS-flip rollback window: do not `terraform destroy` the p41m0n stack. Resolvers that still have Route53 cached will continue to hit it, so the stack must remain operational until the parent TTL fully decays.

### Why this is still worth rehearsing

The slow-rollback constraint applies to the real millsymills cutover too. Learning that on p41m0n — where brokenness is cheap — is exactly the point. The rehearsal's output is a calibrated answer to "how paranoid should I be before flipping NS on the real domain?" Answer: very.

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

Tear-down is the same dance as rollback in reverse, and runs into the same parent-zone delegation TTL.

1. Flip p41m0n registrar NS back to the captured Gandi values. Route53 remains authoritative for any resolver with a cached delegation — potentially up to the parent TTL (~48h for `.com`).
2. **Do not destroy the Route53 stack yet.** Keep the Route53 zone + CloudFront + S3 operational through the delegation-TTL window. If you destroy it immediately, resolvers that still have Route53 cached will serve failures to whoever's still hitting the domain.
3. Wait at least 48h after the NS flip (or confirm via multi-resolver checks that no resolver is still returning Route53 NS). This wait is inherent; nothing you did in step 1 of the pre-cutover can speed it up.
4. `./scripts/tf.sh p41m0n destroy` — tears down CloudFront, S3 bucket, ACM cert, Route53 records, IAM role, email DNS records.
5. Delete the Route53 hosted zone for p41m0n in the AWS console (Terraform never managed it).
6. Either delete the `rehearsal` GitHub Environment and `deploy-rehearsal.yml`, or keep them in place disabled for a future re-rehearsal. Decide at tear-down time.
7. Optionally restore Gandi record TTLs on p41m0n from 300 → 10800.

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
