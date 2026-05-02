# p41m0n.com email migration to Proton

**Status:** approved design, 2026-05-01
**Goal:** flip `p41m0n.com` from null-MX (rehearsal output) to ProtonMail catchall delivery, while keeping all DNS authority in Route53. End state: any address `*@p41m0n.com` lands in `overm1nd@pm.me`. Proves the Proton activation runbook for the upcoming `millsymills.com` cycle.

## Why

The dress-rehearsal spec (`docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`) deliberately left mail off — `p41m0n.com` published null-MX + strict DMARC because Proton activation was scoped out (would have required paying for Proton against a throwaway domain). The rehearsal succeeded, the stack stayed up beyond its planned tear-down window, and `p41m0n.com` is now a permanent dev/sandbox domain. With Proton already paid for on `overm1nd@pm.me` and supporting custom domains on this plan, there's no reason to leave the domain mail-dead any longer.

Activating Proton on `p41m0n.com` first also de-risks the larger millsymills migration. The DNS-authority half is already proven by the rehearsal; the remaining unproven half — Proton custom-domain verification, DKIM CNAME plumbing, catchall behavior — runs end-to-end here against a low-traffic domain before being repeated against the production one.

## Domain state at time of writing

Confirmed via direct probes (`dig +short ... @1.1.1.1`, `aws route53 list-resource-record-sets`, `whois`):

- **`p41m0n.com`** — registered at Gandi. NS already on Route53 (`ns-204.awsdns-25.com.` et al). Hosted zone `Z08582353GK05ITZ9SORO`. MX = `0 .` (RFC 7505 null). Apex TXT = `v=spf1 -all`. `_dmarc.p41m0n.com` strict reject + strict alignment + `rua=mailto:dmarc@p41m0n.com`. `_smtp._tls.p41m0n.com` TLSRPT `rua=mailto:tls-rpt@p41m0n.com`. CloudFront ALIAS records for apex/`www`. ACM cert validation CNAMEs in place.
- **Proton account** — `overm1nd@pm.me`, paid plan with ~547 GB storage (supports custom domains + catchall). Two default addresses (`@pm.me`, `@protonmail.com`). No custom domains currently configured *as far as we could verify directly* — see "Tooling caveats" below for why programmatic verification was blocked.
- **`millsymills.com`** — out of scope for this spec. Still registered at Squarespace, still served by Google Domains nameservers, still using Mailgun MX. Touched only by the "what does this spec NOT do" boundary check at the end.

## Tooling caveats

- **`protonmail-mcp` is broken for custom-domain endpoints.** `mcp__protonmail__proton_list_custom_domains` (and the rest of the `protonraw`-routed calls) return `http 401: {"Code":401,"Error":"Invalid access token"}` against an otherwise-valid session. Root cause: `internal/session/raw.go:setBearer()` sets only `Authorization: Bearer …`; Proton's `/core/v4/domains` requires `x-pm-uid` too. Tools that flow through `go-proton-api` (e.g. `proton_list_addresses`) work because that library sends `x-pm-uid` itself. Filed as `millsmillsymills/protonmail-mcp#2` (2026-05-01). One-line fix in the issue.
- **Workaround for this spec:** all Proton account-side ops are done in the web UI (`account.proton.me`). p41m0n's Proton surface is small enough — three clicks to add domain, three to verify, one to enable catchall — that the MCP fix doesn't pay off here. The fix is on the critical path for the millsymills cycle (which needs `proton_create_address` for `mills@millsymills.com`) and should land before that work begins.

## Decisions (made during brainstorming, locked)

1. **Recipient model:** catchall to `overm1nd@pm.me` for `p41m0n.com`. No specific aliases configured up-front. Future named aliases are absorbed by catchall transparently; promote any high-traffic local-part to a real alias later if desired.
2. **Inbound destination:** Proton-only. No Gmail forwarding from p41m0n. (Mirror question for millsymills is settled the same way: Gmail forwarding will be dropped during the millsymills cycle.)
3. **Outbound from `p41m0n.com`:** none in scope. SPF still flips from `-all` to `include:_spf.protonmail.ch -all` because the existing TF flips both inbound and SPF together; that's harmless when there are no senders. If outbound from `p41m0n.com` becomes a thing later, register the alias in Proton and DKIM is already wired.
4. **Sequencing:** sequential, p41m0n first, then millsymills as a separate spec/cycle. Parallel migration was considered and rejected — Squarespace NS flip carries 48h parent-TTL exposure and benefits from a calibrated playbook learned cheaply on p41m0n.
5. **p41m0n stack disposition:** the rehearsal CloudFront/S3/ACM/IAM stack stays up indefinitely. Original rehearsal tear-down step (in the rehearsal spec) is superseded by this decision; p41m0n becomes a permanent dev/sandbox site whose content will be replaced once the millsymills hosting migration is ready to swap.
6. **Tooling for DNS:** existing Terraform in `infra/email.tf` (designed for exactly this scenario, with two var-driven on-switches) is reused unchanged. No new TF resources.
7. **Tooling for Proton:** web UI for this spec; `protonmail-mcp` (post-fix) for the millsymills cycle.

## Architecture

Two surfaces, two activation switches, three steady-state stages.

### Surfaces

- **Proton account** (`account.proton.me/u/0/mail/domain-names`). Add domain → receive verification token. Verify → receive DKIM selector targets. Enable catchall → all unmatched local-parts route to `overm1nd@pm.me`.
- **DNS authority** (Route53 zone `Z08582353GK05ITZ9SORO`, managed by `infra/email.tf` in this repo). Two TF variables drive the state machine:
  - `protonmail_verification_token` (string, sensitive) — empty = null-MX; populated = Proton-MX + SPF include + verification TXT.
  - `protonmail_dkim_selectors` (`map(string)`) — empty = no DKIM; populated = three CNAMEs at `<selector>._domainkey.p41m0n.com`.

`infra/email.tf` already implements both switches via locals (`local.proton_enabled`, `local.spf_record`, `local.mx_records`) and the four record resources (`mx`, `apex_txt`, `dkim` `for_each`, `dmarc`, `tlsrpt`). No code change is required — only `.tfvars` populates.

### State machine

```
[null-MX, SPF -all, no DKIM]              ← today
    │  set protonmail_verification_token in p41m0n.tfvars; apply
    ▼
[Proton MX, SPF include, verify-TXT]      ← Proton can now verify domain
    │  click Verify in Proton web UI
    │  set protonmail_dkim_selectors in p41m0n.tfvars; apply
    ▼
[Proton MX + SPF include + DKIM CNAMEs]   ← terminal: SPF + DKIM + DMARC all aligned
```

Two `terraform apply` invocations separated by a Proton-side verify click. There is no flag-day cutover risk: pre-state was null-MX (nothing was being delivered), post-state is Proton-delivered, and the swap is an atomic record-set update at the authoritative nameservers.

### Out of scope

- millsymills.com migration in any form (DNS, mail, hosting). Separate spec.
- Outbound senders from `p41m0n.com`. None today; not needed for catchall inbound.
- The `protonmail-mcp` `x-pm-uid` fix. Filed as `protonmail-mcp#2`; due before the millsymills cycle begins.
- Tear-down of the p41m0n CloudFront/S3/ACM/IAM stack. Per decision 5, the stack stays up.
- Any change to the existing DMARC, TLSRPT, CAA, or DNSSEC records. They were correctly deployed during the rehearsal and survive the Proton activation untouched.

## Components

### Files touched

| File | Change |
|---|---|
| `infra/stacks/p41m0n.tfvars` | Edit — round 1 sets `protonmail_verification_token`; round 2 adds `protonmail_dkim_selectors`. The token is `sensitive`-marked at the variable definition; commit policy below. |
| `infra/email.tf` | No edits. Existing locals + resources do the work. |
| `infra/variables.tf` | No edits. Existing variable definitions are sufficient. |
| `docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md` | New — this spec. |
| `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md` | No content edit. Tear-down section in that spec is logically superseded by decision 5 in this spec; cross-reference is sufficient. |

### Proton account ops (web UI)

1. Add `p41m0n.com` as a custom domain → returns the verification TXT token (string of the form `protonmail-verification=…`).
2. After the verification TXT propagates: click **Verify** → returns three DKIM selector targets (typically named `protonmail`, `protonmail2`, `protonmail3`, each pointing at a Proton-managed CNAME target like `<id>.domainkey.<id>.domains.proton.ch.`).
3. **Enable catchall** for `p41m0n.com` → target = `overm1nd@pm.me`.
4. *(Optional, defensible.)* Set `dmarc@p41m0n.com` as a named alias of `overm1nd@pm.me`. Catchall already routes it; the named alias just makes the DMARC reporting destination explicit in Proton's UI for clarity. Same applies to `tls-rpt@`, `security@`. Skip unless wanted.

### Secrets handling

`protonmail_verification_token` is the only sensitive value introduced. Two acceptable patterns:

- **Env-var pattern (preferred for round 1).** Pass as `TF_VAR_protonmail_verification_token=…` on the `apply` invocation. Don't commit the token. Once the domain is verified in Proton, the token is no longer needed for any future `apply` (Proton won't ask again), and the env-var is forgotten.
- **Sensitive-marked-and-committed pattern.** Commit the token in `p41m0n.tfvars`. Proton's verification token is low-risk on its own (it only proves domain ownership; it grants no access). The variable is already `sensitive = true`. Acceptable but lower-rigor.

Either is fine. Pick at apply time.

The DKIM selector CNAME targets are public values (they appear unencrypted in DNS) — fine to commit as plain map entries in `.tfvars`.

## Data flow

### Pre-migration (today)

```
sender → MX(.) → 5xx hard-bounce (RFC 7505 null MX)
```

No mail reaches anywhere. Senders see `domain does not accept mail`.

### After round 1 apply (Proton-MX, no DKIM yet)

Inbound (the only flow in scope):

```
sender → MX(mail.protonmail.ch / mailsec.protonmail.ch)
       → Proton inbound (TLS-required)
       → Proton evaluates SENDER's SPF/DKIM/DMARC and stamps Authentication-Results
       → catchall route (any local-part not matching a named alias)
       → Proton inbox of overm1nd@pm.me
```

Hypothetical outbound (no senders in scope, but the DNS-side wiring is:

```
local sender (Proton SMTP) → Proton outbound MTA
       → mail signed with header From: x@p41m0n.com
       → external receiver evaluates p41m0n.com's SPF (Proton IPs in include:_spf.protonmail.ch — pass)
       → DKIM not yet evaluated (selectors not yet public — round 1 only)
       → DMARC=pass on SPF-aligned (adkim=s, aspf=s — strict alignment via SPF)
```

### After round 2 apply (with DKIM)

Hypothetical outbound, augmented:

```
… external receiver evaluates p41m0n.com's DKIM
       → DKIM=pass on protonmail._domainkey.p41m0n.com (or one of 2 rotation selectors)
       → DMARC=pass on either SPF-aligned or DKIM-aligned (belt + braces)
```

Inbound flow is unchanged from round 1 — DKIM CNAMEs only matter when *we* sign outbound mail, which has no senders today. Round 2 is therefore preparatory: it makes future outbound trustworthy without requiring DNS work at that time.

### DMARC + TLSRPT reporting reverse path

External MTAs publish daily aggregate reports → `mailto:dmarc@p41m0n.com` (and `mailto:tls-rpt@p41m0n.com`) → Proton catchall → `overm1nd@pm.me`. Reports come from major receivers (Google, Microsoft, Yahoo, etc.) on a 24h cadence; silence < 24h is normal.

### Outbound

None in scope. SPF still flips from `-all` to `include:_spf.protonmail.ch -all`, which is harmless given no current senders. If a future use case wants to send `from: …@p41m0n.com`, register the alias in Proton and the existing SPF + DKIM auth path covers it.

## Error handling and rollback

| Failure | Detection | Response |
|---|---|---|
| Verification TXT not propagated when clicking Verify in Proton | Proton UI returns "could not verify" | Wait 5–10 min. `dig +short TXT p41m0n.com @8.8.8.8` should show `protonmail-verification=…`. If not visible, the round-1 apply didn't actually run, or the resolver path isn't observing R53 yet. |
| Round 1 applies cleanly but Proton verify fails | Proton UI error | Inspect the value of `protonmail-verification=…` in the live TXT record vs. the value Proton shows in its UI. Common cause: copy-paste typo when populating `.tfvars`. |
| DKIM CNAMEs published but Proton still shows DKIM unverified | Proton account UI status | `dig +short CNAME protonmail._domainkey.p41m0n.com @8.8.8.8` must match Proton's expected target byte-for-byte (including trailing dot). Common causes: typo in the map value, wrong key in the map (Proton uses `protonmail`, `protonmail2`, `protonmail3` — not arbitrary names). |
| Inbound mail bounces after round 1 | External sender bounce | `dig +short MX p41m0n.com @8.8.8.8` should return `10 mail.protonmail.ch.` and `20 mailsec.protonmail.ch.`. If still showing `0 .`, apply didn't run or the resolver hasn't picked up the change (record TTL is 3600s; bounded). |
| DMARC reports never arrive | Catchall inbox stays silent past 48h | Confirm catchall is enabled in Proton. Send a test from an external account and verify the message has `Authentication-Results: dmarc=pass` headers. If the test passes but reports never come, the issue is upstream (rare); accept and move on — DMARC reports are best-effort. |
| Apply touches resources unrelated to email | TF plan diff includes CloudFront / S3 / IAM changes | Stop. Investigate. The two vars are isolated to email records; any other churn is drift from the rehearsal stack and must be handled separately, not bundled with this change. |

### Rollback

Set `protonmail_verification_token = ""` and clear `protonmail_dkim_selectors` to `{}` → `apply`. The TF reverts MX to null, SPF to `-all`, drops the verification TXT and DKIM CNAMEs. Proton inbox retains any mail that was already delivered (it's already in the mailbox; rollback affects only future delivery). DMARC/TLSRPT records stay as-is. Atomic at the apply boundary; no DNS-cache-flush dance because the parent NS delegation isn't moving — only individual record values change, bounded by their own TTLs (3600s for MX/TXT/CNAME).

The rehearsal spec's slow-rollback warning (parent-zone delegation TTL ≈ 48h) does **not** apply here. That warning is about NS-record changes at the registrar; this spec touches only authoritative records inside an already-delegated zone.

## Testing

### Pre-flight (before round 1)

- `./scripts/tf.sh p41m0n plan` returns a diff containing exactly:
  - `aws_route53_record.mx` value change (null → Proton MX list)
  - `aws_route53_record.apex_txt` value change (SPF only → SPF + verification token)
  - No CloudFront, S3, ACM, IAM, DMARC, TLSRPT, or CAA churn.

### Post round 1

- `dig +short MX p41m0n.com @8.8.8.8` → `10 mail.protonmail.ch.` + `20 mailsec.protonmail.ch.`.
- `dig +short TXT p41m0n.com @8.8.8.8` → contains both `v=spf1 include:_spf.protonmail.ch -all` and `protonmail-verification=…`.
- `dig +short TXT _dmarc.p41m0n.com @8.8.8.8` unchanged from pre-flight.
- Proton web UI verify-domain returns success.

### Post round 2 (DKIM published) + catchall enabled

- `dig +short CNAME protonmail._domainkey.p41m0n.com @8.8.8.8` matches Proton's expected target exactly. Repeat for `protonmail2._domainkey.…` and `protonmail3._domainkey.…`.
- Live inbound test: send from an external account (Gmail or similar) to three addresses, all of which should land in `overm1nd@pm.me`:
  - `random-$(date +%s)@p41m0n.com` (unknown local-part — exercises catchall)
  - `dmarc@p41m0n.com` (the address DMARC reports go to)
  - `mills@p41m0n.com` (a plausible future-named alias)
- Inspect headers of one delivered test message: `Authentication-Results` should show `spf=pass`, `dkim=pass`, `dmarc=pass` for the *sender's* domain (e.g. `header.d=gmail.com`). This validates that Proton's inbound MTA is doing standard auth — not p41m0n's own SPF/DKIM, which is only exercised on outbound.
- Proton account dashboard for `p41m0n.com` shows the domain as **Verified**, MX as **Detected**, SPF as **Detected**, DKIM as **Active** (all three selectors). This is the canonical post-condition for the p41m0n-side auth wiring; outbound auth is exercised only when an actual sender is configured (out of scope).
- *(Optional, defensible.)* To exercise p41m0n's outbound auth path end-to-end without configuring a permanent alias: temporarily create a `test@p41m0n.com` named alias of `overm1nd@pm.me` in Proton, send from it via Proton's webapp to an external Gmail, inspect `Authentication-Results` on the received message — should show `spf=pass dkim=pass dmarc=pass header.d=p41m0n.com`. Delete the alias after. Skip if Proton's dashboard "Verified" is sufficient confidence.

### 24-48h soak

- At least one DMARC aggregate report from a major receiver (Google, Microsoft, etc.) lands in the catchall inbox. Confirms the reverse channel works.
- Optional: run `mail-tester.com` or similar against a fresh test send to the inbox; aim for a deliverability score ≥ 9.0/10. Surface any deductions as follow-up work.

## Acceptance criteria

The migration is complete when, end-to-end:

1. `./scripts/tf.sh p41m0n plan` reports no diff after the round 2 apply (state matches reality).
2. A live external send to a random local-part at `p41m0n.com` lands in `overm1nd@pm.me` within seconds. Proton dashboard for `p41m0n.com` shows MX/SPF/DKIM all green and the domain as Verified.
3. At least one DMARC aggregate report from a major receiver arrives in the catchall inbox within 48h of the round 2 apply.
4. Paper-rollback test: `./scripts/tf.sh p41m0n plan` against an empty token + empty selectors map produces a clean reversion to null-MX + `-all` SPF, with no other churn. (Plan-only; do not actually apply.)
5. `./scripts/tf.sh millsymills plan` is unaffected by any of the work in this spec — state isolation between stacks holds. Sanity check from the rehearsal spec.

## Runbook

1. **Snapshot R53 state.** `aws route53 list-resource-record-sets --hosted-zone-id Z08582353GK05ITZ9SORO > .local/r53-p41m0n-pre-proton.json`. Rollback artifact; `.local/` is git-ignored per repo convention.
2. **Add `p41m0n.com` in Proton web UI** (`account.proton.me/u/0/mail/domain-names`). Copy the verification TXT token shown.
3. **Set `protonmail_verification_token`** in `infra/stacks/p41m0n.tfvars` (or pass via `TF_VAR_protonmail_verification_token` env var per "Secrets handling" above).
4. **Round 1 apply.** `./scripts/tf.sh p41m0n plan && ./scripts/tf.sh p41m0n apply`. Confirm the plan matches the pre-flight expectation.
5. **Wait 5-10 min** for record propagation. Run the post-round-1 `dig` checks.
6. **Click Verify in Proton.** Receive the three DKIM selector targets in the UI.
7. **Set `protonmail_dkim_selectors`** in `.tfvars` as a map of `{ protonmail = "…", protonmail2 = "…", protonmail3 = "…" }`.
8. **Round 2 apply.** Plan should change exactly the three new `aws_route53_record.dkim["…"]` resources.
9. **Enable catchall** for `p41m0n.com` in Proton settings → target `overm1nd@pm.me`.
10. **Live tests** per the post-round-2 testing section.
11. **Commit.** Spec file in `docs/superpowers/specs/`. `.tfvars` changes per the chosen secrets pattern.
12. **Soak window.** Wait 24-48h for the first DMARC aggregate report; confirm acceptance criterion 3.

Total active work: ≈30 min spread over a single afternoon, plus the async DMARC-report soak window.

## Loopback into the millsymills runbook

Findings here that should land in the millsymills cycle's planning before that work starts. All entries below are post-mortem from the actual 2026-05-01 execution:

- **`protonmail-mcp` `x-pm-uid` fix.** `protonmail-mcp#2`. Required before the millsymills cycle, which needs `proton_create_address` for `mills@millsymills.com`. The bug did NOT block this p41m0n cycle in practice — Proton's web UI handled add-domain, verify, catchall in under five minutes total. For catchall-only domains the MCP fix has weak ROI; it earns its keep on millsymills where named aliases are needed.
- **AWS credential wiring for Terraform.** This machine stores AWS CLI v2 creds in the macOS keychain (no `~/.aws/credentials`, no env vars). Terraform's S3 backend cannot read keychain creds directly. Working pattern: in a single shell, `set -a && eval "$(aws configure export-credentials --format env-no-export)" && set +a && ./scripts/tf.sh p41m0n …`. Document this in the millsymills runbook upfront — losing an hour to a "no valid credential sources" error is avoidable. (`scripts/tf.sh` could even bake this in, gated on the absence of `AWS_ACCESS_KEY_ID`.)
- **Pre-flight SNS subscription chicken-and-egg.** The CT-monitor SNS subscription was stuck `PendingConfirmation` because its endpoint (`security@p41m0n.com`) was undeliverable while MX was null. Resolved by routing CT-monitor alerts to a confirmable address (`andyandymillsmills@gmail.com`) before starting the Proton activation, so the TF baseline plan went clean. The same pattern will apply to millsymills if its CT-monitor (or any other SNS-email subscription) targets `security@millsymills.com` while MX still routes to Mailgun. Either route the subscription somewhere confirmable first, or ensure mail flow is live before the SNS subscription is created.
- **Proton MX detection lags significantly.** Despite DNS being correct globally (verified across Google `8.8.8.8`, Cloudflare `1.1.1.1`, Quad9 `9.9.9.9`, DNS.SB Singapore, and the authoritative R53 nameserver, all DNSSEC-validated), Proton's MX status indicator stayed red for ~10–20 minutes after Round 1 apply before flipping green. The other indicators (Domain, Verify, SPF, DKIM, DMARC) flipped green almost immediately. **Don't trust Proton's MX-✗ display as evidence of a real DNS problem.** The empirical test (send a real external email and confirm delivery) is the canonical signal that mail flow is working. For the millsymills cycle, schedule the catchall-toggle step at least 30 minutes after the Proton MX records go live, or be ready to ignore the UI lag.
- **Round 1 actual record propagation: ≤30–60s.** First Proton-MX visibility on `@8.8.8.8` happened on iteration 2 of a 30-second polling loop after `apply` finished. Round 2 DKIM CNAMEs were visible on iteration 1 (first try). The plan's "wait 5–10 min" buffer is well over what was needed — calibrate to ~2 min in the millsymills runbook.
- **Terraform variable precedence gotcha for paper-rollback testing.** `tf.sh` passes `-var-file=stacks/p41m0n.tfvars`, which outranks `TF_VAR_*` env vars in Terraform's precedence order. So `TF_VAR_protonmail_dkim_selectors='{}'` does NOT override the populated map in `.tfvars`. To exercise a true paper-rollback plan that includes the DKIM destroys, either temporarily pass an additional `-var-file` containing empty values (must come AFTER the stack's `.tfvars` in the args), or accept that the DKIM-destroy half is mechanically guaranteed by the `for_each` semantics on an empty map. The rollback was validated to the extent possible (MX + apex_txt revert correctly); the DKIM destroy half is structural, not behavioural.
- **millsymills stack is entirely un-applied.** During Task 10's isolation check, `./scripts/tf.sh millsymills plan` showed `51 to add`. Every resource in `infra/` reads as "to create." This means the millsymills cycle is not "add Proton on top of working AWS hosting" — it is the actual greenfield deployment of the millsymills AWS stack. The rehearsal spec's runbook contemplates this; carry forward the assumption that the millsymills cycle's first applies will produce 50+ creations, not modifications. Plan accordingly: longer apply windows (CloudFront + ACM + DNSSEC will take ~15–20 min), and the DNS authority cutover only happens after the AWS infrastructure is fully provisioned.
- **No unexpected TF plan diffs during the work itself.** Round 1 plan was exactly 2 changes (MX, apex_txt), Round 2 plan was exactly 3 creates (DKIM CNAMEs). No CAA / DNSSEC / CloudFront drift; the shared `infra/` did not require any latent fixes during this cycle.

## What this spec does NOT do

Honest scope limits:

- Does not migrate `millsymills.com` in any form. millsymills NS is still on Google Domains, MX still on Mailgun, registrar still Squarespace. Separate spec, separate cycle.
- Does not configure outbound senders from `p41m0n.com`. SPF/DKIM are wired such that future senders are easy to add, but no aliases or send-as configuration is created.
- Does not fix `protonmail-mcp`. Diagnosed and filed; fix lives in that repo's queue.
- Does not change the rehearsal stack's website content, CloudFront config, ACM cert, or IAM deploy role. The site keeps serving the rehearsal Astro build until the millsymills migration is ready to swap content.
