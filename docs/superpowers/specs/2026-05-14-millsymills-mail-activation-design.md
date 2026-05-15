# millsymills.com mail activation (Proton + AWS)

**Status:** approved design, 2026-05-14
**Goal:** flip `millsymills.com` from null-MX (current state) to ProtonMail delivery on the existing `overm1nd@pm.me` account, with named role aliases, catchall to `mills@`, MTA-STS testing mode published from CloudFront, and the public security surface (`security.txt` Contact + `/security/` page) updated to match reality. End state: any address at `millsymills.com` lands in the Proton mailbox; `dkim=pass`, `spf=pass`, `dmarc=pass` on inbound; MTA-STS policy advertised to senders; no claim on `/security/` outruns the implementation.

## Why

The cutover is open (project memory note `project_deploy_scope.md`, dated 2026-05-12) and the DNS half of the migration already landed. `millsymills.com` is currently in the "safe pre-Proton" posture: `MX 0 .`, `v=spf1 -all`, `p=reject`. That posture is correct as a holding state but it's a no-mail state — the domain has no usable inbox. Activating Proton finishes the cutover and validates the runbook in `CLAUDE.md` against the real domain (the [p41m0n rehearsal spec](./2026-05-01-p41m0n-proton-mail-migration-design.md) proved the basic Proton activation against a low-traffic domain; this cycle repeats it against production and adds MTA-STS).

Coupling MTA-STS testing into this PR is cheap because the infra already exists in `infra/mta_sts.tf` and is already running in testing mode on the p41m0n rehearsal stack (CLAUDE.md § "MTA-STS rollout" — Phase 1). millsymills is the Phase 2 promotion: same module, same Astro page, only the per-stack tfvars flip. Reversal in testing mode is free.

Coupling the `security.txt` + `/security/` updates into this PR preserves the project invariant that every claim on `/security/` cites the implementation (`CLAUDE.md` § "Security controls"). Leaving the page claiming "MTA-STS roadmap" after MTA-STS ships, or leaving `security.txt` Contact pointing at `mills@` after `security@` becomes a routable alias, is exactly the drift the project explicitly disallows.

## Current state (verified 2026-05-14)

Probed via `dig @8.8.8.8` and the Proton MCP server:

- **DNS for `millsymills.com`:**
  - `MX` = `0 .` (null, RFC 7505).
  - Apex `TXT` = `v=spf1 -all` (no senders authorized).
  - `_dmarc` `TXT` = `v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@millsymills.com; fo=1; adkim=s; aspf=s`.
  - `_smtp._tls` `TXT` = `v=TLSRPTv1; rua=mailto:tls-rpt@millsymills.com`.
  - `default._bimi` `TXT` = `v=BIMI1; l=https://millsymills.com/bimi/logo.svg`.
  - DNSSEC chain live (parent DS lodged at registrar).
- **Proton account `overm1nd@pm.me`:**
  - Three existing addresses: `overm1nd@pm.me`, `overm1nd@protonmail.com`, `mills@p41m0n.com`.
  - Storage usage ~91 MiB of 510 GiB.
  - Plan does not grant the `organization` API scope (probed by `proton_list_custom_domains` returning HTTP 403 `MissingScopes: organization`). This is an individual paid plan, not Business. Single-domain provisioning still works (proven by `mills@p41m0n.com`).
- **Terraform scaffold for `millsymills.com` stack:** `infra/email.tf` and `infra/mta_sts.tf` already implement every record this spec needs; only `infra/stacks/millsymills.tfvars` values change. `enable_mta_sts` defaults to `false` and is currently false for mills.
- **Site code:**
  - `src/pages/.well-known/security.txt.ts` line 22 emits `Contact: mailto:mills@${hostname}` (i.e., `mailto:mills@millsymills.com` on prod).
  - `src/data/security-controls.ts`:
    - `mx-null` (line 204): titled "Null MX (RFC 7505) before Proton activation", status `shipped`. Becomes inaccurate once MX flips.
    - `spf` / `dkim` / `dmarc` / `tls-rpt` (lines 213–251): status `shipped` already, but `what:` strings carry "when Proton is off" / "when Proton is active" hedging that's no longer needed post-activation.
    - `mta-sts` (line 253): status `roadmap`. Promotes to `shipped` post-activation.

## Decisions (locked during brainstorming)

1. **Mailbox shape:** primary `mills@millsymills.com` + role aliases (`dmarc@`, `tls-rpt@`, `postmaster@`, `abuse@`, `security@`, `hello@`) + Proton catchall pointing at `mills@`.
2. **MTA-STS phasing:** ride along with this PR in `mode: testing`, `max_age: 86400` (24 h). Promotion to `enforce` is a future change with its own runbook step — path documented in § Future, no calendar date.
3. **Security surface:** updated in the same PR. `security.txt` Contact flips to `mailto:security@<hostname>`. `security-controls.ts` updates `mta-sts` to `shipped` and rewrites the four "before/when Proton" mail-auth entries into present-tense descriptions.
4. **AWS role:** Route53 + CloudFront + ACM + S3 (already deployed). No SES — there is no automated outbound from the site.
5. **Account:** existing `overm1nd@pm.me` (no separate Proton account for `millsymills.com`). Catchall + named aliases unify in the one mailbox; the From identity at send time is selectable in webmail.
6. **Approach:** single PR, three-stage apply (Approach A in brainstorming).

## Architecture

Two surfaces, three sequenced applies.

### Surfaces

- **Proton account** (`account.proton.me`). Add domain → receive verification token. Verify → receive three DKIM CNAME targets. Provision seven addresses + enable catchall.
- **DNS authority** (Route53 zone for `millsymills.com`, managed by `infra/email.tf` and `infra/mta_sts.tf`). Three TF variables drive the state machine:
  - `protonmail_verification_token` — empty = null-MX; populated = Proton-MX + SPF include + verification TXT.
  - `protonmail_dkim_selectors` — empty = no DKIM CNAMEs; three-entry map = DKIM live.
  - `enable_mta_sts` — `false` = no `_mta-sts` discovery TXT; `true` = TXT published with the current `mta_sts_id` value. The CloudFront policy host (`mta-sts.millsymills.com`) is already deployed; the TXT is the public switch.
- **Site build** (Astro). `security.txt` and `/security/` are static-generated from `src/pages/.well-known/security.txt.ts` and `src/data/security-controls.ts`. The monthly deploy cron republishes them.

### State diagram

```
                                  ┌─ Stage 1 ─┐                ┌─ Stage 2 ─┐                ┌─ Stage 3 ─┐
                                  │ tfvars +  │                │ Proton    │                │ tfvars +  │
                                  │ tf apply  │                │ web/MCP   │                │ tf apply  │
                                  ▼           ▼                ▼           ▼                ▼           ▼
[null MX, SPF -all]  ────────►  [Proton MX, SPF include,   ─►  [Proton verified,        ─►  [DKIM live,
[no DKIM, MTA-STS off]           verify TXT, no DKIM,           DKIM targets in hand,        MTA-STS testing,
                                 MTA-STS off]                   addresses + catchall live]   security.txt updated]
```

Stage 2 is the only out-of-band step. Stages 1 and 3 are `./scripts/tf.sh millsymills apply`.

## Three-stage apply sequence

### Stage 1 — open the inbound path

1. Edit `infra/stacks/millsymills.tfvars`: uncomment and populate `protonmail_verification_token = "<token>"`. The token comes from Proton's "Add custom domain" flow — start that flow first (web UI: `account.proton.me/u/0/mail/domain-names → Add custom domain → millsymills.com`) to obtain the token, then paste into tfvars without committing the secret to git. Use environment-variable override (`TF_VAR_protonmail_verification_token=…`) or `terraform.tfvars` (gitignored) — never put the live token in the stack `.tfvars` that is committed.
2. `./scripts/tf.sh millsymills apply`. Resources changed: `aws_route53_record.mx` (null → Proton hosts), `aws_route53_record.apex_txt` (SPF flips + verification TXT added).
3. Wait for DNS propagation. Probe `dig +short MX millsymills.com @1.1.1.1` and `dig +short TXT millsymills.com @1.1.1.1`; both should reflect new values within ~5 minutes.

### Stage 2 — Proton-side provisioning

Run via `protonmail-mcp` where the call succeeds, fall back to web UI on scope errors. The order matters: domain must be verified before addresses can be created on it.

1. `proton_add_custom_domain(domain="millsymills.com")` — registers the domain with Proton and returns the verification token. (If this was already obtained in Stage 1 via web UI, this step is a no-op.)
2. `proton_verify_custom_domain(domain="millsymills.com")` — polls Proton's verifier. Re-run until it returns verified. Typical: 5–30 min after Stage 1 apply, depending on resolver propagation.
3. Read the three DKIM CNAME targets from Proton's domain settings page (no MCP endpoint exposes them at writing time; web UI is canonical).
4. `proton_create_address` for each of: `mills@`, `dmarc@`, `tls-rpt@`, `postmaster@`, `abuse@`, `security@`, `hello@`. Verify each succeeds.
5. `proton_set_catchall(domain="millsymills.com", address="mills@millsymills.com")`. If the MCP call fails with a scope error, enable catchall in the web UI; `proton_get_catchall` after to confirm.

If any `proton_*` call fails with `MissingScopes`, perform that step in the web UI and continue. The MCP server's reach is bounded by the account's plan tier (§ Tooling caveats).

### Stage 3 — DKIM, MTA-STS, security surface

One Terraform apply + one git push + one deploy. The TF changes and the site-code changes go in the same PR, applied/deployed in close sequence to minimize the window between "DKIM live" and "/security/ says MTA-STS is shipped".

1. Edit `infra/stacks/millsymills.tfvars`:
   - Populate `protonmail_dkim_selectors = { protonmail = "<target1>", protonmail2 = "<target2>", protonmail3 = "<target3>" }`.
   - Add `enable_mta_sts = true`.
   - Add `mta_sts_id = "<UTC timestamp in YYYYMMDDTHHMMSSZ form>"`.
2. `./scripts/tf.sh millsymills apply`. Resources changed: `aws_route53_record.dkim` (three new CNAMEs), the MTA-STS discovery TXT, and any ACM cert / CloudFront alias resources that the `enable_mta_sts` flip activates (already pre-built in `mta_sts.tf`; verify the cert validates on the same zone).
3. Edit `src/pages/.well-known/security.txt.ts`:
   - Change `Contact: mailto:mills@${hostname}` → `Contact: mailto:security@${hostname}`.
4. Edit `src/data/security-controls.ts`. Preserve every `id:` field as-is (callers reference these slugs); change only titles, `what:` / `why:` / `tradeoffs:` strings, and `status:`.
   - `id: 'mx-null'` (line 203): retitle to describe the post-activation state (e.g., "MX → Proton (with null-MX fallback)"). Rewrite `what:` to describe both states clearly (Proton MX active when configured, null MX otherwise), preserve `why:`.
   - `id: 'spf'` / `id: 'dkim'` / `id: 'dmarc'` (lines 213–240): drop "when Proton is off" / "when Proton is active" hedging from `what:`; describe the active configuration in present tense. `tradeoffs:` lines stay as-is where they don't rot.
   - `id: 'tls-rpt'` (line 242): drop the `tradeoffs:` line about "useless until Proton is live" — Proton is live.
   - `id: 'mta-sts'` (line 253): status `roadmap` → `shipped`. Update `tradeoffs:` to describe the current testing-mode state and reference the path to enforce (cross-link this spec's § Future).
5. `npm run build` to catch any PostCSS parse errors introduced by adjacent edits (CLAUDE.md flags this gotcha for CSS; precautionary for any edit touching content files).
6. Commit + push + open PR. Merge via squash per the PR convention.
7. The deploy workflow ships the new `security.txt` and `/security/` page to CloudFront. Invalidation `/*` happens automatically (already in the deploy job).

## DKIM-only failure mode

Between Stage 1 and Stage 3, MX is live but DKIM is not. Any inbound mail received during this window:

- Inbound from a sender whose mail Proton would otherwise sign on relay: no DKIM check is performed on **inbound** mail (receivers verify the sender's DKIM, not ours). Inbound delivers normally to Proton; SPF check verifies the sender's authorized IPs.
- Outbound from Proton in this window would be unsigned for our `d=` — i.e., `dkim=none` on outbound — which DMARC strict alignment would reject at the receiver. **Do not send mail from `millsymills.com` between Stage 1 and Stage 3.** This window is meant to be short (Proton verification usually completes inside an hour; provisioning seven addresses + catchall is another ~10 minutes).

Mitigation: keep the gap short by running Stage 2 immediately after Stage 1 propagates, and Stage 3 immediately after Stage 2 surfaces the DKIM targets. Do not advertise the new addresses externally until after Stage 3 deploys.

Alternative considered & rejected: collapse Stages 1 and 3 into one apply by obtaining DKIM CNAMEs first. Rejected because Proton does not expose DKIM targets until domain verification succeeds, and verification requires the verification TXT to be already published — chicken-and-egg with the apply.

## Verification matrix

After Stage 3 deploys, all of these must pass before declaring the activation done. Run against `@1.1.1.1` (Cloudflare) and `@8.8.8.8` (Google) at minimum; mismatch between resolvers usually means propagation isn't complete.

| Check | Command | Expected |
|---|---|---|
| MX | `dig +short MX millsymills.com @1.1.1.1` | `10 mail.protonmail.ch.` and `20 mailsec.protonmail.ch.` |
| SPF | `dig +short TXT millsymills.com @1.1.1.1` | includes `v=spf1 include:_spf.protonmail.ch -all` |
| Verification TXT | `dig +short TXT millsymills.com @1.1.1.1` | includes `protonmail-verification=<token>` |
| DKIM × 3 | `dig +short CNAME protonmail._domainkey.millsymills.com` (and `protonmail2`, `protonmail3`) | resolves to Proton DKIM targets |
| DMARC | `dig +short TXT _dmarc.millsymills.com @1.1.1.1` | unchanged: `p=reject` strict |
| TLS-RPT | `dig +short TXT _smtp._tls.millsymills.com @1.1.1.1` | unchanged: `rua=mailto:tls-rpt@…` |
| MTA-STS discovery | `dig +short TXT _mta-sts.millsymills.com @1.1.1.1` | `v=STSv1; id=<mta_sts_id>` |
| MTA-STS policy | `curl -fsS https://mta-sts.millsymills.com/.well-known/mta-sts.txt` | `version: STSv1`, `mode: testing`, `mx: mail.protonmail.ch`, `mx: mailsec.protonmail.ch`, `max_age: 86400` |
| Inbound delivery | send from a Gmail account to `mills@millsymills.com` | lands in Proton inbox; received headers show `dkim=pass header.d=protonmail.ch`, `spf=pass`, `dmarc=pass` |
| Inbound via alias | send to `security@millsymills.com` | lands in Proton inbox routed to `mills@` |
| Catchall | send to `random-test-string-2026@millsymills.com` | lands in Proton inbox via catchall |
| Outbound DKIM | send from `mills@millsymills.com` to a mail-tester.com address | report shows DKIM aligned, SPF aligned, DMARC pass |
| security.txt | `curl -fsS https://millsymills.com/.well-known/security.txt` | `Contact: mailto:security@millsymills.com` |
| /security/ page | open in browser | `mta-sts` card shows `shipped` and references testing mode; mail-auth cards describe the active configuration in present tense |

DMARC aggregate reports + TLS-RPT reports start arriving 24–48 h later. Confirm at least one DMARC XML lands in `dmarc@` and one TLS-RPT JSON lands in `tls-rpt@` within 72 h before marking the activation "soaked".

## Rollback

Sequence-dependent. The earlier the rollback, the cheaper.

- **During Stage 1 (MX flipped, no other change).** Revert the tfvars `protonmail_verification_token` to its commented-out scaffold state, `tf apply`. MX returns to null, SPF returns to `-all`, verification TXT vanishes. ~5 min DNS propagation. Safe — no mail has flowed yet.
- **During Stage 2 (Proton-side provisioning).** If the domain was added to Proton but you want out: in Proton web UI, remove the domain; on the Route53 side, revert tfvars as in the Stage 1 rollback. Any unprovisioned address creations roll back as no-ops.
- **During Stage 3, post-DKIM, pre-deploy.** Revert tfvars `protonmail_dkim_selectors` (back to empty `{}`) and `enable_mta_sts` (back to `false`); `tf apply`. DKIM CNAMEs and MTA-STS TXT are removed. MX stays on Proton until you also remove the verification token.
- **Once mail has flowed.** Do not roll back. Fix forward. Mail already in the Proton inbox is durable; ripping MX away strands future mail without recovering the past. If a specific config is wrong (e.g., a typo'd DKIM selector), patch the specific value, not the whole flip.

MTA-STS testing mode has no asymmetric reversal property — pulling the discovery TXT is safe at any time because senders are only logging, not enforcing. (This is the entire reason testing mode exists.) The asymmetric reversal warning in `CLAUDE.md` § "MTA-STS rollout" applies only after `mode: enforce` is committed — see § Future below.

## Future: MTA-STS promotion to enforce

Out of this PR but documented here so the trail lives in one place.

After 2–4 weeks in `mode: testing`, with at least three TLS-RPT report cycles (one per ~24 h) showing `policy-type: sts` and no `failure-details.reason: sts-policy-fetch-error` from major senders, promote:

1. Edit `src/pages/.well-known/mta-sts.txt.ts`: change `mode: testing` → `mode: enforce`; change `max_age: 86400` → `max_age: 604800` (7 days, the recommended steady-state cache window).
2. Edit `infra/stacks/millsymills.tfvars`: bump `mta_sts_id` to a fresh UTC timestamp. Senders only refresh their cached policy when the id changes; without a bump, the new policy is invisible until natural cache expiry.
3. Deploy + `tf apply`. Both must land in close sequence; if the TXT id changes before the policy file is served, senders fetch the old policy and cache it with the new id, defeating the rollout.
4. Update `src/data/security-controls.ts` `mta-sts` entry to describe enforce mode in `tradeoffs:` and remove the testing-mode language.

Reversal in enforce mode is asymmetric and dangerous: publish `mode: none` AND wait `max_age` BEFORE setting `enable_mta_sts = false` to drop the discovery TXT. Otherwise enforcing senders refuse delivery during the rollback window. The 7-day `max_age` is the minimum reversal window — pick a `max_age` you can live with as a worst-case outage budget.

No calendar date is set here. File a follow-up issue when TLS-RPT data warrants it.

## Out of scope

- AWS SES, Mailgun, or any third-party outbound MTA. No automated mail leaves the site.
- BIMI Verified Mark Certificate (~$1.5K/yr). The BIMI record is already published; supporting clients (Proton, Fastmail) render the logo without a VMC, while Gmail/Yahoo do not. Cost/benefit documented on `/security/` already; revisit if BIMI on Gmail becomes load-bearing.
- DANE TLSA records in our own zone. Inbound DANE is anchored at Proton's TLSA records in the `protonmail.ch` zone (`/security/` § `dane-smtp` explains the two-zone chain).
- Forwarding from existing third-party inboxes (Gmail personal, etc.) into `mills@millsymills.com`. If desired, set up on the source side (Gmail "Forwarding and POP/IMAP") — outside this spec's surface.
- Account-level changes to `overm1nd@pm.me` (PGP keys, two-factor settings, plan tier). The current plan is sufficient for this work; revisit only if address count climbs past plan ceiling (see § Tooling caveats).

## Tooling caveats

- **Proton MCP scope.** `proton_list_custom_domains` returns HTTP 403 `MissingScopes: organization` on this account — the `organization` scope is a Business-tier feature. Individual-tier calls (`proton_add_custom_domain`, `proton_create_address`, `proton_set_catchall`) appear to work (proven by the existing `mills@p41m0n.com` address on the same account, and by `proton_list_addresses` which succeeds). The plan: attempt each MCP call in Stage 2; on `MissingScopes` failure, fall back to web UI for that specific operation and continue. Document any MCP failures in the implementation plan's verification step so a fix can be filed against `protonmail-mcp`.
- **Address-count ceiling.** Account currently has 3 addresses. This PR adds 7 more for a total of 10. Proton Mail Plus caps at 10 addresses; Unlimited / Family / Business support more. Confirm the plan tier before Stage 2 begins; if at the ceiling, either prune (fold `hello@` and / or `postmaster@`/`abuse@` into the catchall) or upgrade plan.
- **Verification token leakage.** The verification TXT is publicly visible in DNS (`dig TXT millsymills.com`) once Stage 1 lands — that's by design. The token itself is not a credential; it only proves DNS control to Proton during the verification window. Still, do not commit the live token to `infra/stacks/millsymills.tfvars` (which is in git); use environment-variable override or a gitignored `terraform.tfvars` overlay.
- **STS-token expiry during apply.** Stage 1 and Stage 3 applies are short (~1–2 min each) so the STS-token-expiry gotcha from the migration runbook (CLAUDE.md step 5) is unlikely to bite — but the recovery path (`tf force-unlock`, re-export creds, re-run) still applies if it does.

## Open questions

None at spec time. All decisions made in brainstorming.

## References

- `CLAUDE.md` — "Email (ProtonMail)" runbook, "MTA-STS rollout" section, "Migration runbook" step 5.
- `infra/email.tf` — MX/SPF/DKIM/DMARC/TLS-RPT/BIMI Terraform.
- `infra/mta_sts.tf` — MTA-STS CloudFront + ACM + discovery TXT Terraform.
- `infra/stacks/millsymills.tfvars` — where the activation values land.
- `src/pages/.well-known/security.txt.ts` — security.txt source.
- `src/pages/.well-known/mta-sts.txt.ts` — MTA-STS policy file source.
- `src/data/security-controls.ts` — `/security/` page source of truth.
- [`docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md`](./2026-05-01-p41m0n-proton-mail-migration-design.md) — prior rehearsal spec.
- [`docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`](./2026-04-19-p41m0n-dress-rehearsal-design.md) — original rehearsal plan.
