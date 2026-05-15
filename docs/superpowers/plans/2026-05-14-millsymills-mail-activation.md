# millsymills.com Mail Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate ProtonMail delivery for `millsymills.com`, provision seven named addresses + catchall, ship MTA-STS testing mode, and update the public security surface (`security.txt` + `/security/`) so claims match reality.

**Architecture:** Three sequenced applies. Stage 1: Terraform apply with verification token (env-var only — not committed) flips MX/SPF and publishes the verification TXT. Stage 2: out-of-band Proton-side provisioning via MCP (web-UI fallback on scope errors). Stage 3: Terraform apply + site-code edits + push + deploy publishes DKIM CNAMEs, MTA-STS discovery TXT, and the updated security surface.

**Tech Stack:** Terraform 1.10+ (via `./scripts/tf.sh`), AWS (Route53 + CloudFront + ACM), ProtonMail (custom-domain + addresses + catchall), `protonmail-mcp` for Proton API calls, Astro 6 (static site).

**Spec:** [docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md](../specs/2026-05-14-millsymills-mail-activation-design.md)

---

## Pre-flight: Plan tier + state probe

### Task 1: Verify Proton plan tier supports 10+ addresses

**Files:**
- Read-only probe.

- [ ] **Step 1: Probe current Proton account state**

Run:
```bash
# via MCP
proton_whoami
proton_list_addresses
```

Expected: `name=overm1nd`, `max_space_bytes >= 5e10` (50+ GiB indicates paid plan, not Free), and an `addresses` list with three entries (`overm1nd@pm.me`, `overm1nd@protonmail.com`, `mills@p41m0n.com`).

- [ ] **Step 2: Confirm plan ceiling is ≥10 addresses**

The MCP cannot read plan tier directly (`organization` scope unavailable). Decide based on observed capacity:
- If account has been adding addresses freely (e.g. `mills@p41m0n.com` exists alongside two stock ones) and storage shows the high-tier `547608330240` bytes (~510 GiB), the plan is Unlimited or Family — supports 15 addresses for Unlimited, 90 for Family. Proceed.
- If unsure: log into `account.proton.me` → Settings → Plans, confirm "Mail Plus" shows 10 addresses (would be at ceiling after this work) vs "Unlimited" / "Family" / "Visionary" (plenty of headroom).

Decision rule: if Mail Plus, choose ONE of the following before continuing:
- Drop `hello@` from the planned address list (back down to 6 named addresses + primary = 7 new = 10 total).
- Drop `postmaster@` + `abuse@` and rely on catchall for those (back down to 4 named + primary = 5 new = 8 total).
- Upgrade plan before Stage 2.

Document the decision in a comment that goes into `infra/stacks/millsymills.tfvars` later (Stage 3) so the chosen address set is traceable from the tfvars file.

- [ ] **Step 3: Probe current DNS for `millsymills.com`**

Run:
```bash
dig +short MX millsymills.com @1.1.1.1
dig +short TXT millsymills.com @1.1.1.1
dig +short TXT _dmarc.millsymills.com @1.1.1.1
dig +short TXT _smtp._tls.millsymills.com @1.1.1.1
dig +short TXT _mta-sts.millsymills.com @1.1.1.1
dig +short CNAME protonmail._domainkey.millsymills.com @1.1.1.1
```

Expected (pre-activation baseline — record verbatim before changes):
- `MX`: `0 .`
- Apex TXT: `"v=spf1 -all"`
- `_dmarc` TXT: `"v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@millsymills.com; fo=1; adkim=s; aspf=s"`
- `_smtp._tls` TXT: `"v=TLSRPTv1; rua=mailto:tls-rpt@millsymills.com"`
- `_mta-sts` TXT: empty (record does not exist yet)
- `protonmail._domainkey` CNAME: empty (record does not exist yet)

If MX is anything other than `0 .`, STOP and reconcile with the user — someone has already started activation outside this plan.

- [ ] **Step 4: Confirm no uncommitted changes in worktree**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean` or only the plan file uncommitted. If anything else, ask before proceeding.

- [ ] **Step 5: No commit**

Pre-flight is read-only.

---

## Stage 1 — Open the inbound path

### Task 2: Obtain Proton verification token via web UI

**Files:**
- No file changes. User-driven web UI action.

- [ ] **Step 1: Open Proton domain-add flow**

Navigate to `https://account.proton.me/u/0/mail/domain-names` → **Add domain** → enter `millsymills.com`.

Proton displays a verification TXT value of the form `protonmail-verification=<random-token>`.

- [ ] **Step 2: Capture token for the apply**

Export to current shell as an environment variable (do NOT paste into any committed file):
```bash
export TF_VAR_protonmail_verification_token="<paste-token-here-without-the-protonmail-verification=-prefix>"
```

Verify the env var is set and not empty:
```bash
test -n "$TF_VAR_protonmail_verification_token" && echo "OK" || echo "MISSING"
```

Expected: `OK`.

- [ ] **Step 3: Do NOT click Verify yet**

Leave the Proton browser tab open on the verification screen. The next two tasks publish the TXT record and then return here.

- [ ] **Step 4: No commit**

Nothing to commit — token lives in the shell only.

### Task 3: Stage 1 Terraform plan

**Files:**
- Read-only plan: `infra/email.tf`, `infra/stacks/millsymills.tfvars`.

- [ ] **Step 1: Initialize the millsymills stack (idempotent)**

Run:
```bash
./scripts/tf.sh millsymills init
```

Expected: `Terraform has been successfully initialized!` or `Backend reinitialization required` followed by re-init success. Re-run if any provider plugins are missing.

- [ ] **Step 2: Plan the apply with the verification token in env**

Run:
```bash
./scripts/tf.sh millsymills plan -out=/tmp/stage1.tfplan
```

Expected diff (read carefully; this is the gate):
- `~ aws_route53_record.mx` — `records` flips from `["0 ."]` to `["10 mail.protonmail.ch.", "20 mailsec.protonmail.ch."]`.
- `~ aws_route53_record.apex_txt` — `records` flips from `["v=spf1 -all"]` to two-element list including `"v=spf1 include:_spf.protonmail.ch -all"` and `"protonmail-verification=<token>"`.
- **No other resources should change.** If the plan touches DKIM CNAMEs, MTA-STS TXT, the CloudFront distribution, ACM cert, or any unrelated resource, STOP and reconcile — drift or a stale state lock is more likely than the plan being correct.

- [ ] **Step 3: No commit**

Plan output stays in `/tmp`. Token-as-env-var means no file change to commit.

### Task 4: Stage 1 Terraform apply

**Files:**
- Live infrastructure change only.

- [ ] **Step 1: Probe baseline before apply (for diffing)**

Run:
```bash
dig +short MX millsymills.com @1.1.1.1 > /tmp/mx.before
dig +short TXT millsymills.com @1.1.1.1 > /tmp/txt.before
```

- [ ] **Step 2: Apply the planned change**

Run:
```bash
./scripts/tf.sh millsymills apply /tmp/stage1.tfplan
```

Expected: `Apply complete! Resources: 0 added, 2 changed, 0 destroyed.`

If the apply fails with `ExpiredToken` mid-run (STS token expiry per CLAUDE.md migration step 5):
1. Refresh creds: `eval "$(aws configure export-credentials --format env-no-export | sed 's/^/export /')"`.
2. If state is locked, force-unlock with the ID printed in the error: `./scripts/tf.sh millsymills force-unlock -force <ID>`.
3. Re-run `apply` (idempotent — will converge).

- [ ] **Step 3: Probe post-apply DNS (with retries — propagation isn't instant)**

Wait ~30 seconds for Route53 propagation, then run:
```bash
for i in 1 2 3 4 5; do
  echo "--- attempt $i ---"
  dig +short MX millsymills.com @1.1.1.1
  dig +short TXT millsymills.com @1.1.1.1
  sleep 15
done
```

Expected (final attempt):
- `MX`: `10 mail.protonmail.ch.` and `20 mailsec.protonmail.ch.` (order may vary)
- TXT (multiple lines): `"v=spf1 include:_spf.protonmail.ch -all"` AND `"protonmail-verification=<your-token>"`

If after five attempts (~75s + propagation) the values don't appear, probe `@ns-XXX.awsdns-XX.com.` (one of the authoritative NS for the zone, from `dig NS millsymills.com`) — if the authoritative server shows the new values but `@1.1.1.1` doesn't, it's resolver cache. Wait 60s more.

- [ ] **Step 4: No commit**

Stage 1 leaves the repo unchanged; only DNS changed.

---

## Stage 2 — Proton-side provisioning

### Task 5: Trigger Proton verification

**Files:**
- No file changes. User-driven web UI action + MCP call.

- [ ] **Step 1: Click Verify in the Proton web UI**

Return to the Proton tab from Task 2. Click **Verify**. Proton resolves the verification TXT it just observed in DNS.

Expected: green checkmark / "Domain verified" within a few seconds (DNS already propagated in Task 4).

If verification fails: confirm the TXT record is visible from a public resolver via `dig +short TXT millsymills.com @1.1.1.1` and `dig +short TXT millsymills.com @8.8.8.8`. If both show the token, click Verify again. If they don't, the apply didn't fully propagate — wait 60s more.

- [ ] **Step 2: Confirm verification via MCP (independent check)**

Run:
```bash
# via MCP
proton_get_custom_domain(domain="millsymills.com")
```

Expected: response shows `state` or equivalent field indicating verified. If the MCP call returns `MissingScopes` or another auth error, the web-UI confirmation in Step 1 is authoritative — proceed.

- [ ] **Step 3: No commit**

### Task 6: Read DKIM selector targets from Proton

**Files:**
- No file changes. User-driven web UI action — Proton does not currently expose DKIM targets via API the MCP server can read.

- [ ] **Step 1: Open the domain's DKIM settings**

In the Proton web UI: **Settings → Custom domains → millsymills.com → DKIM**.

Proton shows three rows, one per selector (`protonmail`, `protonmail2`, `protonmail3`), each with a target like `protonmail.domainkey.<22-char-id>.domains.proton.ch.` (trailing dot included).

- [ ] **Step 2: Capture all three targets**

Copy each target verbatim — including the trailing dot — into a scratch file. Format must end with `.domains.proton.ch.` (no path, no `https://`).

Compare format against the p41m0n example for sanity:
```
protonmail  = "protonmail.domainkey.<id>.domains.proton.ch."
protonmail2 = "protonmail2.domainkey.<id>.domains.proton.ch."
protonmail3 = "protonmail3.domainkey.<id>.domains.proton.ch."
```

The `<id>` segment will be a unique 22-char alphanumeric token specific to this domain (different from p41m0n's).

- [ ] **Step 3: No commit**

Selector targets land in tfvars in Task 9.

### Task 7: Provision seven addresses

**Files:**
- No file changes. MCP calls + web-UI fallback for any scope errors.

- [ ] **Step 1: Create the primary address**

Run:
```bash
# via MCP
proton_create_address(domain="millsymills.com", local_part="mills", display_name="mills")
```

Expected: success response with new address ID. If response is `MissingScopes` or similar: open Proton web UI → **Settings → Custom domains → millsymills.com → Addresses → Add address** → local part `mills`, display name `mills`. Continue.

- [ ] **Step 2: Create the six role aliases**

For each of `dmarc`, `tls-rpt`, `postmaster`, `abuse`, `security`, `hello` (skip any dropped in Task 1 Step 2's Mail Plus prune), run:

```bash
# via MCP, six times
proton_create_address(domain="millsymills.com", local_part="dmarc",      display_name="dmarc")
proton_create_address(domain="millsymills.com", local_part="tls-rpt",    display_name="tls-rpt")
proton_create_address(domain="millsymills.com", local_part="postmaster", display_name="postmaster")
proton_create_address(domain="millsymills.com", local_part="abuse",      display_name="abuse")
proton_create_address(domain="millsymills.com", local_part="security",   display_name="security")
proton_create_address(domain="millsymills.com", local_part="hello",      display_name="hello")
```

Web-UI fallback per address: same path as Step 1.

- [ ] **Step 3: Verify all addresses exist**

Run:
```bash
# via MCP
proton_list_addresses
```

Expected: the response includes seven new entries under `millsymills.com` (or six if `hello@` was dropped). Cross-check the local parts.

- [ ] **Step 4: No commit**

### Task 8: Enable catchall to `mills@`

**Files:**
- No file changes. MCP call + web-UI fallback.

- [ ] **Step 1: Set catchall**

Run:
```bash
# via MCP
proton_set_catchall(domain="millsymills.com", address="mills@millsymills.com")
```

Expected: success. Web-UI fallback: **Settings → Custom domains → millsymills.com → Catch-all → mills@millsymills.com → Save**.

- [ ] **Step 2: Verify catchall is configured**

Run:
```bash
# via MCP
proton_get_catchall(domain="millsymills.com")
```

Expected: response indicates `mills@millsymills.com` is the catchall destination.

- [ ] **Step 3: No commit**

Stage 2 fully out-of-band. All changes Proton-side.

---

## Stage 3 — DKIM, MTA-STS, security surface, deploy

### Task 9: Edit `infra/stacks/millsymills.tfvars`

**Files:**
- Modify: `infra/stacks/millsymills.tfvars`

- [ ] **Step 1: Add the four new tfvars below the existing `# protonmail_*` scaffold**

Replace lines 10–14 of `infra/stacks/millsymills.tfvars`:

```hcl
# ProtonMail vars — leave blank until Proton is activated.
# See CLAUDE.md "Email (ProtonMail)" runbook for the sequence.
# protonmail_verification_token = ""
# protonmail_dkim_selectors     = {}
```

with:

```hcl
# ProtonMail activated 2026-05-14 per
# docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md.
# Verification token is supplied at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets come from Proton's domain page after verification.
# Selectors must be exactly `protonmail`, `protonmail2`, `protonmail3`
# — Proton uses fixed selector names, and infra/email.tf builds
# <selector>._domainkey.<domain> from the map keys.
protonmail_dkim_selectors = {
  protonmail  = "<paste-protonmail-target-from-task-6>"
  protonmail2 = "<paste-protonmail2-target-from-task-6>"
  protonmail3 = "<paste-protonmail3-target-from-task-6>"
}

# Phase 2 MTA-STS promotion to production stack per #134. p41m0n is
# Phase 1 (rehearsal); millsymills picks up the same policy file
# (src/pages/.well-known/mta-sts.txt.ts, mode: testing) by flipping
# the per-stack discovery-TXT switch.
enable_mta_sts = true
mta_sts_id     = "20260514000000"
```

Replace each `<paste-...>` placeholder with the verbatim target captured in Task 6 Step 2. Triple-check trailing dots.

- [ ] **Step 2: Verify Terraform parses the file**

Run:
```bash
./scripts/tf.sh millsymills validate
```

Expected: `Success! The configuration is valid.`

If `Error: Invalid map element value` or similar appears, recheck the DKIM map syntax — values must be quoted strings ending in `.`.

- [ ] **Step 3: No commit yet**

Commit happens in Task 13 after site code is also updated.

### Task 10: Stage 3 Terraform plan

**Files:**
- Read-only plan.

- [ ] **Step 1: Re-export the verification token (in case of new shell)**

If this task runs in a fresh shell, the env var is gone — re-export from the same value Task 2 captured. If the original token wasn't preserved, paste the token from the Proton web UI again (it's still visible in the domain settings page until DKIM is live).

- [ ] **Step 2: Plan the Stage 3 apply**

Run:
```bash
./scripts/tf.sh millsymills plan -out=/tmp/stage3.tfplan
```

Expected diff:
- `+ aws_route53_record.dkim["protonmail"]` — new CNAME at `protonmail._domainkey.millsymills.com`
- `+ aws_route53_record.dkim["protonmail2"]` — new CNAME at `protonmail2._domainkey.millsymills.com`
- `+ aws_route53_record.dkim["protonmail3"]` — new CNAME at `protonmail3._domainkey.millsymills.com`
- `+ aws_route53_record.mta_sts_txt[0]` — new TXT at `_mta-sts.millsymills.com` with `v=STSv1; id=20260514000000`

Plan should show: `4 to add, 0 to change, 0 to destroy`.

If any other resource appears: STOP. The MX/SPF/verification-TXT records should already be in their Stage 1 state (no change in this plan).

- [ ] **Step 3: No commit**

### Task 11: Stage 3 Terraform apply

**Files:**
- Live infrastructure change.

- [ ] **Step 1: Apply the planned change**

Run:
```bash
./scripts/tf.sh millsymills apply /tmp/stage3.tfplan
```

Expected: `Apply complete! Resources: 4 added, 0 changed, 0 destroyed.`

STS-token / state-lock recovery: same procedure as Task 4 Step 2.

- [ ] **Step 2: Probe DKIM CNAMEs**

Wait ~30s, then:
```bash
for selector in protonmail protonmail2 protonmail3; do
  echo "--- $selector ---"
  dig +short CNAME "${selector}._domainkey.millsymills.com" @1.1.1.1
done
```

Expected: each command emits exactly one line, the matching Proton target string.

- [ ] **Step 3: Probe MTA-STS discovery TXT**

```bash
dig +short TXT _mta-sts.millsymills.com @1.1.1.1
```

Expected: `"v=STSv1; id=20260514000000"`.

- [ ] **Step 4: Probe MTA-STS policy via HTTPS**

The CloudFront alias for `mta-sts.millsymills.com` was provisioned at stack creation; the policy file is already served. Verify it resolves correctly:
```bash
curl -fsS https://mta-sts.millsymills.com/.well-known/mta-sts.txt
```

Expected body:
```
version: STSv1
mode: testing
mx: mail.protonmail.ch
mx: mailsec.protonmail.ch
max_age: 86400
```

If HTTPS errors with cert mismatch: confirm `mta-sts.millsymills.com` is in the ACM cert's SAN list (`aws acm describe-certificate --region us-east-1 --certificate-arn $(./scripts/tf.sh millsymills output -raw acm_certificate_arn)` then search `SubjectAlternativeNames` for `mta-sts.millsymills.com`). If missing, the cert needs `mta_sts.tf`'s SAN to be picked up — should already be present from stack init.

- [ ] **Step 5: No commit yet**

Site code edits next.

### Task 12: Update `src/pages/.well-known/security.txt.ts`

**Files:**
- Modify: `src/pages/.well-known/security.txt.ts:22`

- [ ] **Step 1: Edit the Contact line**

Open `src/pages/.well-known/security.txt.ts`. Locate line 22:

```typescript
		`Contact: mailto:mills@${hostname}`,
```

Replace with:

```typescript
		`Contact: mailto:security@${hostname}`,
```

This works for both stacks because `hostname` derives from `Astro.site` — rehearsal builds emit `security@p41m0n.com` (which is a separate question; if p41m0n doesn't have `security@` aliased, file a follow-up — out of scope here).

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run check
```

Expected: `0 errors, 0 warnings`.

- [ ] **Step 3: Build (catches PostCSS errors per CLAUDE.md)**

Run:
```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: build succeeds, `dist/` is generated.

- [ ] **Step 4: Verify the rendered security.txt**

Run:
```bash
cat dist/.well-known/security.txt
```

Expected: includes `Contact: mailto:security@millsymills.com` (not `mills@`).

- [ ] **Step 5: No commit yet**

Bundle commits with security-controls update.

### Task 13: Update `src/data/security-controls.ts`

**Files:**
- Modify: `src/data/security-controls.ts` (six entries, lines ~203–261)

- [ ] **Step 1: Update the `mx-null` entry**

Locate the entry with `id: 'mx-null'` (around line 203). Replace its `title:` and `what:` to describe the post-activation state. Preserve `id`, `category`, `status`, `why`, `code`.

Before:
```typescript
		title: 'Null MX (RFC 7505) before Proton activation',
		category: 'email',
		status: 'shipped',
		what: 'Until ProtonMail is configured, `MX 0 .` is published — the explicit "this domain accepts no mail" record.',
```

After:
```typescript
		title: 'MX → Proton (with null-MX fallback when off)',
		category: 'email',
		status: 'shipped',
		what: 'When `protonmail_verification_token` is populated (production state for `millsymills.com`), `MX 10 mail.protonmail.ch.` and `MX 20 mailsec.protonmail.ch.` route inbound to ProtonMail. When the token is blank (pre-activation state), `MX 0 .` (RFC 7505) is published — the explicit "this domain accepts no mail" record — so an in-progress activation never leaves a spoofable gap.',
```

- [ ] **Step 2: Update the `spf` entry**

Locate `id: 'spf'`. Replace `what:`:

Before:
```typescript
		what: '`v=spf1 -all` when Proton is off; `v=spf1 include:_spf.protonmail.ch -all` once activated.',
```

After:
```typescript
		what: '`v=spf1 include:_spf.protonmail.ch -all` (production state for `millsymills.com`). Pre-activation, the fallback is `v=spf1 -all` — no senders authorized at all.',
```

- [ ] **Step 3: Update the `dkim` entry**

Locate `id: 'dkim'`. Replace `what:`:

Before:
```typescript
		what: 'When Proton is active, three CNAMEs at `<selector>._domainkey.<domain>` (selectors `protonmail`, `protonmail2`, `protonmail3`) point at Proton-hosted DKIM keys. CNAMEs are gated on `proton_enabled` so an apply without the verification token tears them down alongside the MX/SPF flip — never orphaned.',
```

After:
```typescript
		what: 'Three CNAMEs at `<selector>._domainkey.<domain>` (selectors `protonmail`, `protonmail2`, `protonmail3`) point at Proton-hosted DKIM keys. CNAMEs are gated on `proton_enabled` (derived from `protonmail_verification_token`) so an apply without the verification token tears them down alongside the MX/SPF flip — never orphaned.',
```

Also update `code:` to include both stack tfvars:
```typescript
		code: ['infra/email.tf', 'infra/stacks/millsymills.tfvars', 'infra/stacks/p41m0n.tfvars'],
```

- [ ] **Step 4: Update the `dmarc` entry tradeoffs**

Locate `id: 'dmarc'`. Replace `tradeoffs:`:

Before:
```typescript
		tradeoffs: 'Aggregate reports land at `dmarc@<domain>` — useless until that mailbox actually exists in Proton.',
```

After:
```typescript
		tradeoffs: 'Aggregate reports land at `dmarc@<domain>` — provisioned as a real address on `millsymills.com` per the 2026-05-14 activation spec.',
```

- [ ] **Step 5: Update the `tls-rpt` entry tradeoffs**

Locate `id: 'tls-rpt'`. Replace `tradeoffs:`:

Before:
```typescript
		tradeoffs: 'Useless until Proton is live — null MX means no remote MTA attempts delivery, so no reports get generated.',
```

After:
```typescript
		tradeoffs: 'Aggregate reports land at `tls-rpt@<domain>` — provisioned alongside the rest of the role aliases. First reports arrive ~24h after activation.',
```

- [ ] **Step 6: Update the `mta-sts` entry (status flip + tradeoffs rewrite)**

Locate `id: 'mta-sts'` (the one in the email section around line 253). Change:

Before:
```typescript
		status: 'roadmap',
		what: 'Publishes `_mta-sts.<domain> TXT "v=STSv1; id=…"` and serves a policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt` listing the Proton MX hosts as the only valid SMTP endpoints. Sending MTAs that respect MTA-STS upgrade opportunistic TLS to enforced TLS for inbound mail.',
		why: 'MTA-STS blocks passive downgrade attacks on inbound SMTP that DNSSEC + DANE alone don\'t cover for senders that don\'t implement DANE (most large providers ship MTA-STS; DANE adoption is narrower). Visible control that peer MTAs can observe via HTTPS, complementing the DNSSEC-rooted DANE chain.',
		tradeoffs: 'Phase 1 ships `mode: testing` on the rehearsal stack (`p41m0n.com`) so senders log policy mismatches via TLS-RPT but still deliver; reversible. Phase 2 promotes to `mode: enforce` after 2-4 weeks of clean TLS-RPT reports show `policy-type: sts`, and to `millsymills.com` after the cutover. Reversal in enforce mode is asymmetric: publish `mode: none` AND wait `max_age` BEFORE removing the discovery TXT, otherwise enforcing senders refuse delivery during the rollback window.',
		code: ['infra/mta_sts.tf', 'src/pages/.well-known/mta-sts.txt.ts'],
```

After:
```typescript
		status: 'shipped',
		what: 'Publishes `_mta-sts.<domain> TXT "v=STSv1; id=…"` and serves a policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt` listing the Proton MX hosts as the only valid SMTP endpoints. Sending MTAs that respect MTA-STS upgrade opportunistic TLS to enforced TLS for inbound mail.',
		why: 'MTA-STS blocks passive downgrade attacks on inbound SMTP that DNSSEC + DANE alone don\'t cover for senders that don\'t implement DANE (most large providers ship MTA-STS; DANE adoption is narrower). Visible control that peer MTAs can observe via HTTPS, complementing the DNSSEC-rooted DANE chain.',
		tradeoffs: 'Currently in `mode: testing` (`max_age: 86400`) on both stacks: senders log policy mismatches via TLS-RPT but still deliver, so the rollout is reversible. Promotion to `mode: enforce` follows 2-4 weeks of clean TLS-RPT reports showing `policy-type: sts` — see `docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md` § Future. Reversal in enforce mode is asymmetric: publish `mode: none` AND wait `max_age` BEFORE removing the discovery TXT, otherwise enforcing senders refuse delivery during the rollback window.',
		code: ['infra/mta_sts.tf', 'infra/stacks/millsymills.tfvars', 'infra/stacks/p41m0n.tfvars', 'src/pages/.well-known/mta-sts.txt.ts'],
```

- [ ] **Step 7: Typecheck**

Run:
```bash
npm run check
```

Expected: `0 errors, 0 warnings`.

- [ ] **Step 8: Build**

Run:
```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Smoke-check the rendered /security/ page**

Run:
```bash
npm run preview &
PREVIEW_PID=$!
sleep 3
curl -fsS http://localhost:4321/security/ | grep -E "(mta-sts|MTA-STS)" | head -10
kill $PREVIEW_PID
```

Expected: the rendered HTML for the `mta-sts` card no longer shows roadmap styling and the `tradeoffs:` text matches what you wrote.

- [ ] **Step 10: No commit yet**

### Task 14: Commit + push + PR

**Files:**
- Stage: `infra/stacks/millsymills.tfvars`, `src/pages/.well-known/security.txt.ts`, `src/data/security-controls.ts`.

- [ ] **Step 1: Confirm staged files**

Run:
```bash
git status
```

Expected staged + unstaged: only the three files above. If anything else is dirty, investigate before continuing.

- [ ] **Step 2: Run ci-local for the safety net**

Run:
```bash
./scripts/ci-local.sh
```

Expected: all checks pass (node typecheck, build, terraform fmt/validate).

If `MMS_VERIFY_STATE_BUCKET=true` mode is used and AWS creds aren't loaded, the state-bucket check is opt-in — leave the var unset for this run, the rest of the suite is sufficient.

- [ ] **Step 3: Commit infra change**

Run:
```bash
git add infra/stacks/millsymills.tfvars
git commit -m "$(cat <<'EOF'
feat(email): activate Proton for millsymills.com (DKIM + MTA-STS testing)

Populates protonmail_dkim_selectors with the three Proton-issued
CNAME targets and flips enable_mta_sts=true so the _mta-sts
discovery TXT publishes. MX + SPF + verification TXT were flipped
in Stage 1 via TF_VAR_protonmail_verification_token (not committed).

Phase 2 of MTA-STS rollout per #134 — same policy file as p41m0n
(testing mode, 24h max_age). Promotion to enforce gated on 2-4
weeks of clean TLS-RPT.

See docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commit site-code change**

Run:
```bash
git add src/pages/.well-known/security.txt.ts src/data/security-controls.ts
git commit -m "$(cat <<'EOF'
docs(security): reflect activated mail on security.txt + /security/

Flips security.txt Contact to security@<hostname> (provisioned as a
Proton alias in the activation cycle). Updates /security/ controls
to drop "before Proton activation" hedging from mx-null/spf/dkim,
removes the "useless until Proton is live" tradeoff from tls-rpt
and dmarc, and promotes mta-sts from roadmap to shipped with
testing-mode language.

Keeps the page-vs-reality invariant per CLAUDE.md § "Security controls".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push to a feature branch and open PR**

The cutover deploys land on `main` via squash-merge per the repo PR convention. Branch + PR:

```bash
git checkout -b mail-activation-millsymills
git push -u origin mail-activation-millsymills
gh pr create --title "feat(email): activate Proton for millsymills.com" --body "$(cat <<'EOF'
## Summary

- Populates `protonmail_dkim_selectors` (three Proton-issued CNAMEs) and `enable_mta_sts=true` for the millsymills stack.
- Flips `security.txt` Contact to `security@<hostname>`.
- Updates `/security/` mail-auth controls to present-tense; promotes `mta-sts` from `roadmap` to `shipped` (testing mode).

Activation done in three sequenced stages per the spec. Stage 1 (MX/SPF flip + verification TXT) and Stage 2 (Proton-side addresses + catchall) completed pre-PR; this PR carries Stage 3.

## Test plan

- [ ] Stage 3 `tf apply` succeeded; `dig` returned expected DKIM CNAMEs and `_mta-sts` TXT.
- [ ] `curl https://mta-sts.millsymills.com/.well-known/mta-sts.txt` returns the policy in `mode: testing`.
- [ ] `npm run build` succeeds; rendered `security.txt` shows `Contact: mailto:security@millsymills.com`.
- [ ] Test inbound mail (from gmail) lands at `mills@millsymills.com` with `dkim=pass`, `spf=pass`, `dmarc=pass`.
- [ ] Test inbound to `security@millsymills.com` (named alias) lands.
- [ ] Test inbound to `random-string-2026@millsymills.com` (catchall) lands.
- [ ] Test outbound from `mills@millsymills.com` scores 10/10 on mail-tester.com with aligned DKIM + SPF.
- [ ] First DMARC aggregate XML arrives at `dmarc@` within 24-48h.
- [ ] First TLS-RPT JSON arrives at `tls-rpt@` within 24-48h.

Spec: `docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Return it to the user.

- [ ] **Step 6: Merge after review**

After the user reviews + approves, merge via squash per the repo convention:

```bash
gh pr merge <PR-NUMBER> --squash --delete-branch
```

The `deploy.yml` workflow fires on push to `main` (workflow_dispatch + schedule are the configured triggers — confirm whether merge-to-main also triggers; if not, `gh workflow run deploy.yml` manually).

---

## Post-deploy verification

### Task 15: Run the full verification matrix

**Files:**
- No file changes. Verification only.

- [ ] **Step 1: Wait for deploy workflow to finish**

Run:
```bash
gh run list --workflow=deploy.yml --limit 1
gh run watch <RUN-ID>
```

Expected: green run within ~3 minutes.

- [ ] **Step 2: Run every check in the spec's verification matrix**

Execute each command from the spec § Verification matrix and record the actual output beside the expected one. Any mismatch is a failure to investigate before declaring done.

```bash
# Cheat-sheet, one block:
echo "=== MX ===";              dig +short MX millsymills.com @1.1.1.1
echo "=== SPF + verify TXT ==="; dig +short TXT millsymills.com @1.1.1.1
echo "=== DKIM ===";             for s in protonmail protonmail2 protonmail3; do echo "-- $s"; dig +short CNAME "${s}._domainkey.millsymills.com" @1.1.1.1; done
echo "=== DMARC ===";            dig +short TXT _dmarc.millsymills.com @1.1.1.1
echo "=== TLS-RPT ===";          dig +short TXT _smtp._tls.millsymills.com @1.1.1.1
echo "=== MTA-STS TXT ===";      dig +short TXT _mta-sts.millsymills.com @1.1.1.1
echo "=== MTA-STS policy ===";   curl -fsS https://mta-sts.millsymills.com/.well-known/mta-sts.txt
echo "=== security.txt ===";     curl -fsS https://millsymills.com/.well-known/security.txt
```

- [ ] **Step 3: Inbound mail tests**

From a Gmail account (`andyandymillsmills@gmail.com` per memory), send three test messages:
1. To `mills@millsymills.com` (primary).
2. To `security@millsymills.com` (named alias).
3. To `random-test-2026@millsymills.com` (catchall).

For each, in Proton webmail:
- Confirm the message arrives in inbox.
- Open the message → **More → View headers** (or "View source"). Confirm headers include:
  - `Authentication-Results: ... dkim=pass header.d=gmail.com` (the sender's DKIM, not ours — but pass means the chain held).
  - For our DMARC alignment to matter, the next test does it.

- [ ] **Step 4: Outbound DKIM test**

From Proton webmail, send a new message from `mills@millsymills.com` to `test@mail-tester.com` (the address mail-tester.com gives you when you load the page). After ~30s, check the report at the URL mail-tester.com displayed.

Expected: 10/10 score, with SPF aligned, DKIM aligned, DMARC pass for `millsymills.com`. Any score below 10 — investigate the specific check that failed.

- [ ] **Step 5: 24-72h soak — first DMARC and TLS-RPT reports**

This is a wait-and-check step, not an active step. Schedule a follow-up to check 24h, 48h, and 72h after activation:

```bash
# In Proton webmail: search inbox for sender domain.
# Expected first DMARC report from google (24-48h), expected first TLS-RPT from a sender 24-48h after the first mail flowed.
```

If no DMARC report arrives within 72h: confirm the test mail in Step 3 actually originated from a DMARC-reporting receiver (Gmail does report). If no TLS-RPT after 72h: low traffic could mean no sender has aggregated enough to report yet; not a failure by itself.

- [ ] **Step 6: Update memory with activation outcome**

After the soak completes, write a short project memory entry (`memory/project_mail_activation.md`) capturing: activation date, address count after activation, any MCP fallbacks needed, any verification mismatches investigated. This becomes load-bearing context for the eventual enforce-mode promotion.

- [ ] **Step 7: No commit**

Verification is read-only. The memory update from Step 6 is in the user's `~/.claude` memory dir, not the repo.

---

## Self-review (run before handing the plan to executing-plans / subagent-driven-development)

**Spec coverage check** (cross-reference each spec section):

| Spec § | Plan task |
|---|---|
| § Why — context for activation | Plan header + Task 1 baseline probe |
| § Current state | Task 1 Step 3 |
| § Decisions § 1 (mailbox shape) | Tasks 7, 8 |
| § Decisions § 2 (MTA-STS testing) | Tasks 9–11 |
| § Decisions § 3 (security surface in same PR) | Tasks 12–13 |
| § Decisions § 4 (no SES) | Out of scope; no plan task |
| § Decisions § 5 (existing account) | Task 1 probe |
| § Decisions § 6 (Approach A) | Plan structure as a whole |
| § Architecture | Plan structure |
| § Three-stage apply sequence | Tasks 2–13 |
| § DKIM-only failure mode | Plan note in Task 11; reinforced by send-window guidance |
| § Verification matrix | Task 15 |
| § Rollback | Plan note in Task 4 / 11; not a task because rollback is conditional |
| § Future § enforce promotion | Out of plan scope (future PR) |
| § Out of scope | n/a |
| § Tooling caveats — MCP scope | Tasks 5, 7, 8 fallback paths |
| § Tooling caveats — address ceiling | Task 1 Step 2 |
| § Tooling caveats — token leakage | Task 2 Step 2 (env-var-only) |
| § Tooling caveats — STS expiry | Task 4 Step 2, Task 11 Step 1 |

No gaps.

**Placeholder scan:** searched plan for "TBD", "TODO", "fill in", "appropriate", "as needed", "etc." outside example output. Two `<paste-...>` placeholders in Task 9 Step 1 are intentional — they reference values produced in Task 6 and are the actual mechanism for transferring state between tasks. Acceptable.

**Type/identifier consistency:** address local-parts (`mills`, `dmarc`, `tls-rpt`, `postmaster`, `abuse`, `security`, `hello`) match across Tasks 1, 7, 12, and 15. DKIM selector names (`protonmail`, `protonmail2`, `protonmail3`) match Tasks 6, 9, 11, 15. `mta_sts_id = "20260514000000"` matches Tasks 9, 10, 11. tfvars file path `infra/stacks/millsymills.tfvars` is consistent. Site code paths consistent.

Plan ready.
