# p41m0n.com Proton Mail Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate ProtonMail catchall delivery on `p41m0n.com` end-to-end. After this plan: any address `*@p41m0n.com` lands in `overm1nd@pm.me`, with SPF + DKIM + DMARC fully wired for future outbound.

**Architecture:** Two `terraform apply` invocations against the existing `infra/email.tf` (which already implements a var-driven null-MX → Proton state machine), separated by a Proton web-UI verify click. No new TF resources. No code changes. Two `infra/stacks/p41m0n.tfvars` edits and four manual Proton web-UI clicks. Live-mail tests + soak window confirm.

**Tech Stack:** Terraform 1.x via `./scripts/tf.sh p41m0n …` wrapper, AWS Route53 (zone `Z08582353GK05ITZ9SORO`), ProtonMail (`overm1nd@pm.me`), `dig` for DNS validation, `aws route53` CLI for snapshot.

**Reference spec:** `docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md`. Read it before starting — this plan assumes its decisions.

**Working directory:** All `terraform`/`./scripts/tf.sh` commands run from the `millsymills.com` repo root: `/Users/mills/Desktop/Projects/millsymills.com`. The p41m0n.com repo (where this conversation started) does NOT need any edits in this plan.

**Secrets policy for this plan:** the Proton verification token is passed via the `TF_VAR_protonmail_verification_token` env var on each `apply` invocation. NOT committed to `.tfvars`. DKIM selector CNAME targets ARE public values and ARE committed to `.tfvars`. Rationale: keeps the only sensitive value out of git, while keeping public DNS values reviewable in version control.

---

## File Structure

| File | Role | Status |
|---|---|---|
| `infra/stacks/p41m0n.tfvars` | Per-stack TF var values for the p41m0n stack. Modified twice: once to add `protonmail_dkim_selectors` (Task 6). Token stays out of this file (env var). | Modified |
| `infra/email.tf` | Mail DNS records (MX, apex TXT/SPF/verify, DKIM CNAMEs, DMARC, TLSRPT). Already implements the activation state machine. | Read-only |
| `infra/variables.tf` | Variable definitions including `protonmail_verification_token`, `protonmail_dkim_selectors`. | Read-only |
| `scripts/tf.sh` | Stack-aware Terraform wrapper from the rehearsal spec. Used for every TF call here. | Read-only |
| `.local/` | Git-ignored directory for rollback artifacts (R53 snapshot). | Created if absent |

---

## Pre-flight Checks (Task 1)

### Task 1: Verify clean starting state

**Files:**
- Create: `.local/r53-p41m0n-pre-proton.json` (rollback artifact, git-ignored)
- Modify: none
- Test: dig probes + `terraform plan` no-diff check

- [ ] **Step 1: Confirm working directory and git state**

Run from `/Users/mills/Desktop/Projects/millsymills.com`:

```bash
pwd
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: working dir is `…/millsymills.com`, on `main` (or a working branch), no staged changes related to this work.

- [ ] **Step 2: Confirm AWS auth + R53 zone exists**

```bash
aws sts get-caller-identity
aws route53 get-hosted-zone --id Z08582353GK05ITZ9SORO --query 'HostedZone.Name' --output text
```

Expected: caller-identity returns the expected account; second command prints `p41m0n.com.`.

- [ ] **Step 3: Snapshot current R53 state for rollback**

```bash
mkdir -p .local
aws route53 list-resource-record-sets \
  --hosted-zone-id Z08582353GK05ITZ9SORO \
  --output json > .local/r53-p41m0n-pre-proton.json
wc -l .local/r53-p41m0n-pre-proton.json
```

Expected: file is non-empty (~50+ lines depending on record count). `.local/` should already be in the repo's `.gitignore` from the rehearsal work.

- [ ] **Step 4: Snapshot current live DNS for cross-check**

```bash
dig +short MX p41m0n.com @8.8.8.8
dig +short TXT p41m0n.com @8.8.8.8
dig +short TXT _dmarc.p41m0n.com @8.8.8.8
```

Expected:
- MX: `0 .` (RFC 7505 null MX — current rehearsal-output state)
- Apex TXT: `"v=spf1 -all"`
- DMARC TXT: `"v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@p41m0n.com; fo=1; adkim=s; aspf=s"`

If any of these don't match, STOP. The starting state diverges from the spec's assumptions; investigate before changing anything.

- [ ] **Step 5: Confirm zero-drift TF baseline**

```bash
./scripts/tf.sh p41m0n init -reconfigure
./scripts/tf.sh p41m0n plan -detailed-exitcode
```

Expected: exit code `0` (no changes). If exit code is `2` (changes pending), there is unrelated drift that must be resolved before proceeding — these record changes must not be bundled with email work.

- [ ] **Step 6: Confirm Proton account access**

Open https://account.proton.me/u/0/mail/domain-names in a browser. Sign in as `overm1nd@pm.me`. Confirm:
- The Domains page loads.
- `p41m0n.com` is NOT listed (this plan is adding it). If it IS already listed, STOP and reconcile with the spec — partial state from a prior aborted attempt may exist.

No commit for Task 1; nothing changed.

---

## Round 1 — Add Verification Token (Tasks 2-3)

### Task 2: Add p41m0n.com as a custom domain in Proton

**Files:**
- Create: none
- Modify: none
- Test: capture verification token to local notes (not git)

- [ ] **Step 1: Open Proton's domain-add UI**

Open https://account.proton.me/u/0/mail/domain-names. Click **Add custom domain**.

- [ ] **Step 2: Enter the domain name**

Enter `p41m0n.com`. Click **Add**.

- [ ] **Step 3: Capture the verification TXT token**

Proton displays a panel showing the required TXT record. Copy the FULL value, which has the form:

```
protonmail-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Save the token portion (the string AFTER `protonmail-verification=`) somewhere local but ephemeral — a scratch file under `~/.local/state/p41m0n-migration/token.txt` or just kept in the terminal scrollback. NOT committed to git.

- [ ] **Step 4: Leave the Proton tab open**

Stay on the Proton domain page; you'll click "Verify" on it after Task 3 lands.

No commit for Task 2; nothing changed in the repo.

---

### Task 3: Round 1 apply — publish verification TXT + flip MX to Proton

**Files:**
- Create: none
- Modify: none (token passed via env var, not committed)
- Test: TF plan diff + post-apply dig probes

- [ ] **Step 1: Pre-apply plan with the token set, dry-run**

Replace `XXXX…` below with the actual token captured in Task 2 Step 3:

```bash
TF_VAR_protonmail_verification_token='XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
  ./scripts/tf.sh p41m0n plan
```

Expected diff (and only this diff):
- `aws_route53_record.mx` — `records` changes from `["0 ."]` to `["10 mail.protonmail.ch.", "20 mailsec.protonmail.ch."]`.
- `aws_route53_record.apex_txt` — `records` changes from `["v=spf1 -all"]` to `["v=spf1 include:_spf.protonmail.ch -all", "protonmail-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"]`.

If the plan shows ANY other resource changing (CloudFront, S3, ACM, IAM, DMARC, TLSRPT, CAA, DNSSEC), STOP. Investigate. Don't bundle drift with this work.

- [ ] **Step 2: Apply round 1**

```bash
TF_VAR_protonmail_verification_token='XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
  ./scripts/tf.sh p41m0n apply
```

Confirm by typing `yes` when prompted. Expected: 2 resources changed (the MX and the apex TXT). Apply completes in <30s.

- [ ] **Step 3: Wait for record propagation**

Wait at least 5 minutes (records have TTL 3600s but new values typically appear at major resolvers within 1-5 minutes after Route53 ingest). While waiting, watch:

```bash
while ! dig +short MX p41m0n.com @8.8.8.8 | grep -q 'mail.protonmail.ch'; do
  echo "$(date +%H:%M:%S) — still null MX, waiting…"
  sleep 30
done
echo "Proton MX live."
```

Stop the loop with `Ctrl-C` when it prints "Proton MX live."

- [ ] **Step 4: Verify post-apply DNS state**

```bash
echo "--- MX ---"
dig +short MX p41m0n.com @8.8.8.8
echo "--- apex TXT ---"
dig +short TXT p41m0n.com @8.8.8.8
echo "--- DMARC (unchanged) ---"
dig +short TXT _dmarc.p41m0n.com @8.8.8.8
```

Expected:
- MX: `10 mail.protonmail.ch.` and `20 mailsec.protonmail.ch.`
- Apex TXT: `"v=spf1 include:_spf.protonmail.ch -all"` AND `"protonmail-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"` (two separate TXT records on the same name; DNS allows this).
- DMARC: unchanged from Task 1 Step 4.

If MX or TXT don't match, recheck plan/apply output — apply may not have run, or the resolver path lags. If after 15 min the values haven't appeared at `@8.8.8.8`, also check `@1.1.1.1` and `@9.9.9.9` to disambiguate global propagation from a single-resolver cache miss.

- [ ] **Step 5: No commit yet**

The token is in env var only; nothing in the repo changed. Move directly to Task 4.

---

## Round 2 — DKIM (Tasks 4-6)

### Task 4: Verify domain in Proton; capture DKIM selector targets

**Files:**
- Create: none
- Modify: none
- Test: Proton dashboard shows `Verified`; DKIM CNAME targets captured

- [ ] **Step 1: Click Verify in Proton**

Return to the Proton domain page (still open from Task 2 Step 4). Click **Verify**. If it errors with "could not verify":
- Re-run `dig +short TXT p41m0n.com @8.8.8.8` — confirm `protonmail-verification=…` is present at the resolver Proton uses (likely Google's `8.8.8.8` or similar).
- Wait another 5 min and retry. Most failures here are propagation lag, not config errors.

- [ ] **Step 2: Capture the DKIM selector CNAME targets**

Once verified, Proton displays the DKIM section listing three required CNAME records, each of the form:

```
Hostname:  protonmail._domainkey.p41m0n.com
Type:      CNAME
Value:     <unique-id-A>.domainkey.<unique-id>.domains.proton.ch.
```

```
Hostname:  protonmail2._domainkey.p41m0n.com
Type:      CNAME
Value:     <unique-id-B>.domainkey.<unique-id>.domains.proton.ch.
```

```
Hostname:  protonmail3._domainkey.p41m0n.com
Type:      CNAME
Value:     <unique-id-C>.domainkey.<unique-id>.domains.proton.ch.
```

Copy each `Value` exactly, INCLUDING the trailing dot. Note them in scratch (terminal scrollback or the same ephemeral file from Task 2). The selector NAMES (`protonmail`, `protonmail2`, `protonmail3`) are fixed — the existing TF expects exactly those map keys.

- [ ] **Step 3: Leave the Proton tab open**

You'll come back to enable catchall in Task 7.

No commit for Task 4.

---

### Task 5: Edit p41m0n.tfvars to add DKIM selectors

**Files:**
- Create: none
- Modify: `infra/stacks/p41m0n.tfvars`
- Test: file syntax check via `terraform fmt -check` and `terraform validate` (run as part of plan)

- [ ] **Step 1: Read current p41m0n.tfvars**

Confirm the current contents are still:

```hcl
aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
deploy_workflow    = "deploy-rehearsal.yml"
deploy_environment = "rehearsal"
```

If anything else is present, reconcile with the spec and the rehearsal spec before editing.

- [ ] **Step 2: Replace the stale trailing comment with the DKIM selectors map**

Edit `infra/stacks/p41m0n.tfvars` to remove the trailing two-line comment block that reads:

```hcl
# p41m0n rehearsal does not activate ProtonMail; email.tf publishes
# null-MX + strict DMARC in this state. User does not use p41m0n mail.
```

…and replace it with the following block, substituting the three placeholder values with the actual CNAME targets captured in Task 4 Step 2 (preserve the trailing dot on each value):

```hcl
# ProtonMail activated 2026-05-01 per
# docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md.
# Verification token is supplied at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets come from Proton's domain page after verification.
# Selectors must be exactly `protonmail`, `protonmail2`, `protonmail3`
# — Proton uses fixed selector names, and infra/email.tf builds
# <selector>._domainkey.<domain> from the map keys.
protonmail_dkim_selectors = {
  protonmail  = "<unique-id-A>.domainkey.<unique-id>.domains.proton.ch."
  protonmail2 = "<unique-id-B>.domainkey.<unique-id>.domains.proton.ch."
  protonmail3 = "<unique-id-C>.domainkey.<unique-id>.domains.proton.ch."
}
```

The end of the file should look like the snippet above. Earlier lines (`aws_region`, `domain`, `github_repo`, `deploy_branch`, `deploy_workflow`, `deploy_environment`) are unchanged.

- [ ] **Step 3: Format check**

```bash
terraform -chdir=infra fmt -check stacks/p41m0n.tfvars
```

Expected: no output, exit 0. If format fails, run `terraform -chdir=infra fmt stacks/p41m0n.tfvars` and re-check.

- [ ] **Step 4: Plan with token + new selectors**

Replace `XXXX…` with the actual token (same env var as Task 3):

```bash
TF_VAR_protonmail_verification_token='XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
  ./scripts/tf.sh p41m0n plan -detailed-exitcode
```

Expected: exit code `2` with EXACTLY these diffs and no others:
- `aws_route53_record.dkim["protonmail"]` — create.
- `aws_route53_record.dkim["protonmail2"]` — create.
- `aws_route53_record.dkim["protonmail3"]` — create.

If the plan shows anything else changing (especially MX or apex TXT — those should be steady at the round-1 state), STOP. Investigate.

No apply yet.

---

### Task 6: Round 2 apply — publish DKIM CNAMEs

**Files:**
- Create: none
- Modify: none (selectors already saved in Task 5)
- Test: dig CNAME for each selector

- [ ] **Step 1: Apply round 2**

```bash
TF_VAR_protonmail_verification_token='XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
  ./scripts/tf.sh p41m0n apply
```

Confirm with `yes`. Expected: 3 resources created (the three DKIM CNAMEs). Apply completes in <30s.

- [ ] **Step 2: Wait for CNAME propagation**

```bash
for s in protonmail protonmail2 protonmail3; do
  echo "--- $s ---"
  while ! dig +short CNAME "$s._domainkey.p41m0n.com" @8.8.8.8 | grep -q 'domains.proton.ch.'; do
    echo "$(date +%H:%M:%S) — $s not visible yet, waiting…"
    sleep 30
  done
  echo "$s live."
done
```

Stop with `Ctrl-C` once all three print "live." Typically 1-3 minutes.

- [ ] **Step 3: Verify each CNAME matches Proton's expected target**

```bash
for s in protonmail protonmail2 protonmail3; do
  echo "--- $s ---"
  dig +short CNAME "$s._domainkey.p41m0n.com" @8.8.8.8
done
```

Cross-check each value against what Proton showed in Task 4 Step 2, byte-for-byte INCLUDING the trailing dot. Mismatch = typo in `.tfvars`; fix and re-apply.

- [ ] **Step 4: Confirm Proton dashboard shows DKIM Active**

Reload the Proton domain page. The DKIM section should now show all three selectors as **Active** / green. If Proton still shows them pending after 5 minutes, click any "Re-check" button Proton offers. Pure UI lag, not a real failure mode in 99% of cases.

- [ ] **Step 5: Commit the .tfvars change**

```bash
git add infra/stacks/p41m0n.tfvars
git diff --cached  # sanity-check the diff
git commit -m "$(cat <<'EOF'
infra(p41m0n): add ProtonMail DKIM selectors

Round 2 of p41m0n.com Proton activation per
docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md.
The verification token (round 1) is intentionally not committed —
passed via TF_VAR_protonmail_verification_token at apply time.
EOF
)"
```

---

## Catchall and Live-Mail Tests (Tasks 7-8)

### Task 7: Enable catchall in Proton

**Files:**
- Create: none
- Modify: none
- Test: Proton settings UI shows catchall enabled

- [ ] **Step 1: Open the addresses/catchall UI**

In Proton, navigate to **Settings → Mail → Domains → p41m0n.com**. Find the **Catch-all** section.

- [ ] **Step 2: Enable catchall, target the master inbox**

Toggle catchall **ON**. Set the target address to `overm1nd@pm.me`. Save.

- [ ] **Step 3: Confirm the dashboard summary**

The `p41m0n.com` row should show: Verified ✓, MX detected ✓, SPF detected ✓, DKIM active ✓, Catch-all enabled ✓.

No commit for Task 7.

---

### Task 8: Live inbound delivery tests

**Files:**
- Create: none
- Modify: none
- Test: external sends actually land in the catchall inbox

- [ ] **Step 1: Send three external test emails**

From an external account (Gmail, etc.), send three messages with these recipients (one each):

```
random-$(date +%s)@p41m0n.com
dmarc@p41m0n.com
mills@p41m0n.com
```

Use distinct subjects, e.g. `p41m0n catchall test 1`, `… 2`, `… 3` so they're easy to find later.

- [ ] **Step 2: Confirm all three land in overm1nd@pm.me**

Open Proton mail web app. Inbox should contain all three test messages within seconds (typical delivery latency is sub-minute). If any are missing after 5 min, check Proton's spam folder, then the original sender's bounce log.

- [ ] **Step 3: Inspect headers of one delivered message**

In Proton mail web app, open one of the test messages → use the message-source / show-original feature. Look for the `Authentication-Results` header. Expected (for a Gmail sender):

```
Authentication-Results: mail.protonmail.ch;
  spf=pass (sender SPF authorized) smtp.mailfrom=...@gmail.com;
  dkim=pass header.d=gmail.com;
  dmarc=pass header.from=gmail.com
```

Note: `header.d` and `header.from` will be the SENDER's domain (gmail.com), not p41m0n.com. That is correct — these checks describe the inbound sender's auth, not p41m0n's. p41m0n's own SPF/DKIM/DMARC is exercised on outbound, which is out of scope. Proton's dashboard from Task 6 Step 4 is the canonical evidence that p41m0n.com's auth records are correct.

No commit for Task 8.

---

## Verification, Rollback Test, and Soak (Tasks 9-11)

### Task 9: Paper-rollback test

**Files:**
- Create: none
- Modify: none (plan-only; do NOT apply)
- Test: TF plan against empty vars produces clean reversion

- [ ] **Step 1: Plan against empty token AND empty selectors map**

```bash
TF_VAR_protonmail_verification_token='' \
TF_VAR_protonmail_dkim_selectors='{}' \
  ./scripts/tf.sh p41m0n plan -detailed-exitcode
```

Expected: exit code `2` with EXACTLY these diffs:
- `aws_route53_record.mx` — `records` changes from `["10 mail.protonmail.ch.", "20 mailsec.protonmail.ch."]` to `["0 ."]`.
- `aws_route53_record.apex_txt` — `records` changes from `["v=spf1 include:_spf.protonmail.ch -all", "protonmail-verification=…"]` to `["v=spf1 -all"]`.
- `aws_route53_record.dkim["protonmail"]` — destroy.
- `aws_route53_record.dkim["protonmail2"]` — destroy.
- `aws_route53_record.dkim["protonmail3"]` — destroy.

DMARC, TLSRPT, CAA, NS, SOA, ACM CNAMEs, CloudFront ALIAS records — all unchanged.

- [ ] **Step 2: Do NOT apply**

This is a paper test. Discard the plan; the live state stays at the round 2 terminal state. The test confirms the rollback path is well-defined and atomic.

- [ ] **Step 3: Note the actual TF_VAR override syntax for rollback**

If a real rollback is ever needed, Step 1's command (replacing `plan` with `apply`) is the full procedure. Document this in your local ops notes.

No commit for Task 9.

---

### Task 10: Sanity check — millsymills stack untouched

**Files:**
- Create: none
- Modify: none
- Test: `tf.sh millsymills plan` shows no diff caused by p41m0n work

- [ ] **Step 1: Plan the millsymills stack**

```bash
./scripts/tf.sh millsymills init -reconfigure
./scripts/tf.sh millsymills plan -detailed-exitcode
```

Expected: exit code `0` (no changes), or any pre-existing drift that is documented elsewhere and predates this plan.

If exit code is `2` AND the diff includes records related to p41m0n (e.g. somehow the wrong stack's state got muddled), STOP — state isolation has failed and a remediation needs to happen before any further work in either stack.

- [ ] **Step 2: Compare to pre-plan baseline**

Cross-reference the plan output against any millsymills-stack drift that existed before Task 1 began. Net-net: this plan's work should add zero diff to the millsymills stack. If there was pre-existing drift in millsymills, it remains pre-existing — not this plan's concern.

No commit for Task 10.

---

### Task 11: Soak window + DMARC report check (24-48h async)

**Files:**
- Create: none
- Modify: none
- Test: at least one DMARC aggregate report arrives in catchall inbox

- [ ] **Step 1: Wait 24-48h**

Major receivers (Google, Microsoft, Yahoo, etc.) emit DMARC aggregate XML reports on a daily cadence to the address in the `rua` of the DMARC record (`dmarc@p41m0n.com`). They go through catchall to `overm1nd@pm.me`.

- [ ] **Step 2: Confirm at least one aggregate report arrived**

Open Proton mail. Search subject for `Report Domain: p41m0n.com` or look for senders like `noreply-dmarc-support@google.com`, `dmarc-noreply@google.com`, or similar from Microsoft / Yahoo. At least one report should be present within 48h.

- [ ] **Step 3: Quick-read the report**

The report is gzipped XML attached to the message. Either open in Proton's preview (some reports are inline) or save and decompress. Look for:
- `<source_ip>` matching Proton's outbound IPs (none expected yet — no senders in scope; reports describe activity related to MAIL FROM `p41m0n.com`, of which there should be near-zero).
- `<spf>` and `<dkim>` results showing `pass`.
- `<disposition>` showing `none` (not `quarantine` / `reject`) for any legitimate flow.

For p41m0n's catchall-only setup, the most useful signal is just: **the report channel works**. Even an empty/near-empty report from Google confirms the reverse-path plumbing.

No commit for Task 11.

---

## Loopback (Task 12)

### Task 12: Capture loopback findings for the millsymills cycle

**Files:**
- Create / Modify: `docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md` (loopback section update)
- Modify: this plan file (post-mortem note at bottom)
- Test: spec/plan reflect actual experience

- [ ] **Step 1: Note actual propagation time observed**

Calculate the wall-clock seconds between Task 3 Step 2 (apply finished) and the first time `dig` showed Proton MX live. Note the value.

- [ ] **Step 2: Note any unexpected TF plan diffs encountered**

If any task hit "STOP, investigate" because plan showed unexpected churn, document what it was and how it was resolved.

- [ ] **Step 3: Update the spec's "Loopback into the millsymills runbook" section**

Edit `docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md`. Replace any vague "5-10 min" estimate in the loopback section with the actual observed propagation time. Add a bullet for any drift findings.

- [ ] **Step 4: If the protonmail-mcp `x-pm-uid` bug (issue #2) blocked anything else**

If the workaround (web UI for Proton ops) was painful in any specific way, add a note to `protonmail-mcp` issue #2 with details. Keep it specific — "the verify button took N tries because…" is useful; "MCP would have been nicer" is not.

- [ ] **Step 5: Commit the loopback updates**

```bash
git add docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md \
        docs/superpowers/plans/2026-05-01-p41m0n-proton-mail-migration.md
git commit -m "$(cat <<'EOF'
docs: post-mortem notes from p41m0n Proton activation

Calibrates the propagation-time estimate and captures any TF/Proton
findings worth carrying into the millsymills migration cycle.
EOF
)"
```

---

## Acceptance Gate

The plan is complete when, in order:

1. Task 1 confirmed clean starting state.
2. Tasks 2-3 published Proton MX + verification TXT, dig probes confirm.
3. Tasks 4-6 published DKIM CNAMEs, Proton dashboard shows all green.
4. Task 7 enabled catchall.
5. Task 8 delivered three live test emails to `overm1nd@pm.me`.
6. Task 9 confirmed paper-rollback path is clean.
7. Task 10 confirmed millsymills stack untouched (state isolation holds).
8. Task 11 confirmed at least one DMARC aggregate report arrived in the catchall inbox within 48h.
9. Task 12 committed loopback findings.

If any step fails, halt and reconcile against the spec before proceeding.
