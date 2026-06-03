---
title: Phase 5c remaining tasks — deferred items + review follow-ups
type: feat
status: active
date: 2026-04-24
origin: docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md
---

# Phase 5c remaining tasks — deferred items + review follow-ups

## Overview

The Phase 5c batch (#41–#45) shipped, plus four follow-ups that the original spec
explicitly deferred (Cmd-P quick-open #179, source-control panel #180, 12th flag
#178, mail proof-of-work #181). What's left is three buckets: (a) the still-deferred
items from the original spec — shiki syntax highlighting, age public key,
security.txt freshness — (b) review follow-ups that came out of #147/#149/#150/#159
post-merge reviews, and (c) three small UX polish items that came out of 5c work.

This plan groups 13 issues into 11 reviewable PRs, ordered to land cleanup before
new features and to let later units depend on earlier scaffolding (e.g., the age
key reuses the unified PGP-data plumbing landed in the prior unit).

## Problem Frame

Each issue is small and bounded. The work is mostly: tighten types, derive lists
that are currently shadowed, wire CI assertions for invariants that are easy to
drift, finish the design-token migration that ran ahead of one branch, and ship
the deferred features. None of these are individually risky, but several touch
the same files (`src/data/pgp.ts`, `src/scripts/vscode/`, `scripts/ci-local.sh`),
which is why bundling matters.

There are no open PRs, so the original task's `/pr-review on open PRs` half is
inapplicable. The expected workflow once execution starts is `/pr-review` per new
PR as it opens — that's standard practice and doesn't need to be enumerated as
plan steps.

## Requirements Trace

- R1. Close #170 — vscode.exe shiki syntax highlighting
- R2. Close #174 — publish age public key alongside PGP
- R3. Close #175 (or #153, choose one) — security.txt cannot silently expire
- R4. Close #151 — all four PGP-path consumers read `pgp.downloadPath`
- R5. Close #152 — CI fails when `pgp.asc`, WKD binary, or `pgp.ts` drift
- R6. Close #154 — `dotfiles` command list is derived from `virtualFs`, not shadowed
- R7. Close #155 — six review-feedback nits from #149 review
- R8. Close #160 — `VfsNode` is a discriminated union
- R9. Close #161 — adding a `?raw` import that needs URL scrubbing fails diagnosably
- R10. Close #162 — `vscode.exe` uses neon-noir tokens, not legacy `--ink`/`--cream`
- R11. Close #146 — pre-capture desktop has zero flag-related UI; first capture celebrates and unlocks
- R12. Close #148 — sudo lecture #3 is "spiderman"
- R13. Close #158 — `.motif-scanlines` and `.motif-chrom` are wired up to actually fire (Option 1)
- R14. Each PR is independently reviewable, follows the project squash-commit + `<type>(<scope>): <summary> (#<pr>)` convention

## Scope Boundaries

- This plan does not propose an 11th theme picker, wallpaper picker, or shutdown animation (#163, #164, #166) — those are 5c-adjacent UX work but were never on the 5c spec
- This plan does not touch the broader Tier 1–5 security backlog (#136–#145) — separate phase
- This plan does not introduce new third-party runtime deps beyond what shiki requires (and shiki itself must be code-split or build-time-only per #170 acceptance)
- This plan does not refactor `Entry` in `virtualFs` to a discriminated union (#115). `VfsNode` is the local mirror inside `src/scripts/vscode/`; the bigger sweep across the terminal+vscode shared substrate stays its own ticket

### Deferred to Separate Tasks

- **#153 vs #175 deconfliction** — both issues address the same reliability gap (security.txt Expires going stale). This plan picks #153's option (a) — scheduled monthly rebuild via GitHub Actions cron — and recommends closing #175 as YAGNI. See "Key Technical Decisions" below. If the user prefers Terraform-driven generation, swap Unit 9's approach during execution; the plan's other units don't depend on the choice
- **PR review of merged 5c work** — the user opted not to retrospectively review #177–#181. Standard `/pr-review` runs per-PR as each unit below opens its PR
- **`/security` colophon page** — referenced by #146 as a future home for "the sitemap-vs-hide tension is documented here." Out of scope for this plan; that page belongs in a separate UX issue when it ships

## Context & Research

### Relevant Code and Patterns

- **PGP data:** `src/data/pgp.ts` — single source of truth, 23 lines, well-shaped already. Consumers: `src/components/desktop/apps/About.astro`, `src/components/desktop/apps/Mail.astro`, `src/scripts/terminal/commands/basic.ts` (`pubkey`), `src/pages/.well-known/security.txt.ts`
- **CI guards:** `scripts/ci-local.sh` already runs `assert-no-url-leakage.sh`, `assert-icon-assets-exist.sh` — there is a clear pattern for adding new assert scripts. New PGP consistency check (#152) follows the same shape
- **Build-time secrets/derived values:** `astro.config.mjs` reads `PUBLIC_GIT_SHA` via `execFileSync` (no shell) and exposes via Vite `define`. Same machinery is used for `PUBLIC_GIT_LOG` (built for vscode SCM panel #180). Pattern is well-established
- **Vite snippet scrubber:** `astro.config.mjs:57-74` has `scrubVscodeSnippets` plugin with hardcoded `snippetTargets` list — #161 unifies this with `src/scripts/vscode/file-tree.ts` `?raw` imports
- **Design tokens:** `src/styles/desktop.css :root` defines neon-noir tokens (`--ink-primary`, `--bg-edge`, `--bg-raised`, `--bg-void`, `--neon-pink-*`, `--neon-cyan`, `--neon-lilac`). Legacy aliases (`--ink`, `--cream`, `--pink-*`) still work but are repointed; #162 finishes the migration in `src/styles/vscode.css`
- **Motif utilities:** `.motif-grain` is the live exemplar (`DesktopLayout.astro` mounts it once). `.motif-scanlines` is the unused parallel (`Terminal` consumes `var(--scanlines)` directly); `.motif-chrom` is unused entirely. Spec target surfaces for chrom: window titlebar text, taskbar clock, start menu header
- **Flag store:** `src/scripts/flags.ts` is the capture path. `flag-toast` CSS at `src/styles/desktop.css:784-813` is the banner base for #146. Event bus at `src/scripts/util/events.ts` is the unlock broadcast channel
- **Terminal command registry:** `src/scripts/terminal/commands/basic.ts` registers `help`, `dotfiles`, `pubkey`, `privacy`, `incidents`, `man`. New commands or list-changes go through `registerCommand(...)` exclusively — no module-side effects
- **Static-file deploy:** `aws s3 sync dist/ s3://millsymills.com --delete` (per `.github/workflows/deploy.yml`). Anything not in `dist/` after build either needs a separate `aws s3 cp` or must be renderable via an Astro endpoint (the security.txt approach today)
- **PR + merge convention:** squash-merge, single-line conventional commit `<type>(<scope>): <summary> (#<pr>)`. From CLAUDE.md

### Institutional Learnings

- `docs/solutions/best-practices/universal-desktop-shell-per-page-changes-2026-04-24.md` — pattern for "every desktop app shares a `DesktopLayout`; per-app changes route through component, not layout." Relevant for #146 (don't sneak flag-UI gating into the layout)
- `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md` — neon-noir token spec. Authoritative for #162 token mapping
- CLAUDE.md note: `*/` inside CSS block comments terminates early in PostCSS. When documenting `--legacy-* / --new-*` pairs, space around the asterisks. Relevant for #162 if any comments document the migration
- CLAUDE.md note: `npm run check` does NOT run PostCSS. For any CSS edit (#162, #158), `npm run build` is the actual safety net

### External References

- shiki bundle-size guidance: shiki ships its grammars as JSON. The right pattern for a static site is to import only the languages used (`zsh`, `lua`, `markdown`, `astro`, `typescript`) and render at build time inside the file-tree snippet pipeline, so runtime cost is just CSS. Confirm during Unit 8 whether build-time prerender or runtime-with-code-split fits the existing snippet pipeline better — the issue accepts either
- WKD spec — `gpg --with-wkd-hash --list-keys` already in use via `scripts/generate-wkd.sh`; consistency check in #152 reuses the same machinery

## Key Technical Decisions

- **#153 vs #175 — pick #153.** Ship the GitHub Actions monthly cron rebuild. Rationale: (a) zero new infra; the deploy pipeline already runs `aws s3 sync` and the build endpoint already computes `Expires: build-time + 12mo`; (b) a 5-line cron addition guarantees ≤1mo freshness, which is well inside the 12mo Expires window; (c) Terraform-rendered files would require carving an exception in `aws s3 sync --delete`, which is a real footgun for future "why is this file appearing/disappearing?" debugging. Close #175 as superseded with a one-line comment pointing at the cron PR
- **PGP age key shape — extend `pgp.ts`, don't split into `keys.ts`.** Rationale: `pgp.ts` is 23 lines and already has the right shape (single source of truth for key surfaces). Renaming to `keys.ts` is a bigger refactor than the work merits; just add `age: { recipient, createdAt }` as a sibling field. The terminal command stays `pubkey` (it always meant "public keys" plural, and a rename would break shell history and any third-party links). Mention "PGP" and "age" explicitly in the command's output header so users can tell what they're looking at
- **shiki strategy — build-time prerender into the existing snippet pipeline.** Rationale: the vscode tree only opens 8–12 known files; rendering each one at build time produces a small set of pre-highlighted HTML strings that ship as static assets. Avoids loading shiki at runtime, avoids any client bundle bloat, and keeps the editor pane simple (`innerHTML = prerendered[path]`). If a file lacks a language hint, fall back to plain text exactly as today
- **#160 + #161 land in one PR.** Both touch `src/scripts/vscode/`, both are small refactors with no behavior change. One PR keeps the type-tightening + snippet-list-sharing coherent
- **#151 + #152 land in one PR.** Both touch `pgp.ts`, security.txt endpoint, and `ci-local.sh`. The CI assertion (#152) is dead weight unless the consumers actually read the constants (#151), so they belong together
- **#155's "alias field shape" sub-finding — pick the doc-only resolution.** The current `'grep (aliased)'` strings work because `findTool` falls back to bare-token extraction. Reshaping to `aliases: [{ token, note }]` is a real refactor with no functional gain. Document that `aliases` are display-friendly strings (lookup tolerates parenthetical decoration) and move on. The other five #155 sub-findings are real fixes
- **#158 — pick Option 1.** Wire `.motif-chrom` to titlebar text, taskbar clock, start menu header (the spec's stated intent). Refactor Terminal's `.term__crt::before` to consume `.motif-scanlines` instead of inlining `var(--scanlines)`. Option 2 (retire the classes) is honest about current state but throws away brainstorm-approved design intent
- **#146 unlock signal — derive, don't add a new key.** `mills.flags.v1` already persists captured flags; "≥1 captured" is the unlock predicate. No new localStorage key, which means the privacy page (`mills.vscode.v1` etc.) doesn't need updating
- **#146 banner reuse — extend `.flag-toast`, don't introduce a parallel `.flag-banner`.** Subsequent captures keep the small toast; the first capture promotes the same toast component to a larger "alert-style" variant via a `data-first-capture` attribute. One CSS module, two states

## Open Questions

### Resolved During Planning

- _Should `/pr-review on open PRs` be done?_ — No. Zero open PRs at plan time; review happens per-PR as each unit's PR opens. Resolved via clarifying question
- _Bundle by issue or one-PR-per-issue?_ — Bundle when files overlap and the work is review-driven nits; standalone PR for features and isolated cleanups. See "Implementation Units" for the partition. Resolved by inspection
- _#153 vs #175?_ — Pick #153 (cron rebuild), close #175 as superseded. See Key Technical Decisions
- _Shiki: full runtime vs build-time prerender?_ — Build-time prerender. See Key Technical Decisions
- _age key: extend `pgp.ts` or split into `keys.ts`?_ — Extend in place. See Key Technical Decisions
- _#155 alias field reshape: do or doc?_ — Doc-only. See Key Technical Decisions

### Deferred to Implementation

- **shiki theme:** the issue suggests "match the neon-noir palette or generate one from `desktop.css` tokens." Best resolved when prototyping — a hand-rolled theme keyed off existing `--ink-primary` / `--neon-*` tokens looks closer to the rest of the site than any stock shiki theme, but requires a 30-minute experiment to confirm. Defer to Unit 8's implementer
- **#146 sitemap tension:** the issue notes `src/pages/sitemap.xml.ts` lists `/flags/` as canonical, which somewhat contradicts "hide pre-capture." Recommendation in the issue is to keep it in sitemap (search engines aren't the audience) and document in `/security` when that page ships. Confirm during Unit 11; if the implementer finds the sitemap entry distasteful, removing it is a one-line change
- **#170 mobile fallback:** issue says "Mobile vscode pane still renders without highlighting overhead if it adds bulk." Decide once shiki landed-bundle size is measurable
- **#152 `EXPECTED_FP` extraction regex:** the issue's example regex `0BD8[A-F0-9 ]+DC66` is fragile (grep on a TS file). The implementer should pick whichever extraction is least likely to drift — could parse `pgp.ts` as JSON-ish via `node -p`, or grep for `fingerprint:` literally. Either works; pick during implementation
- **#161 option (a) vs (b):** issue accepts either "share the list" or "CI grep assertion." Recommend option (a) — single source of truth is structurally better — but implementer can pick (b) if the import topology proves messy

## Implementation Units

- [ ] **Unit 1: Terminal one-liner — sudo lecture #3 → "spiderman"** (closes #148)

**Goal:** Change the third item in the mock sudo lecture from "With great power comes great responsibility." to "spiderman".

**Requirements:** R12

**Dependencies:** None.

**Files:**
- Modify: `src/scripts/terminal/commands/fun.ts`

**Approach:**
- One-line text edit on the third `out('    #3) ...');` call. Keep the `    #3) ` prefix and the trailing period (or drop the period — one-word gag, no period reads cleaner).
- No formatting / behavior changes.

**Patterns to follow:**
- Existing `out(...)` calls in `fun.ts` for the two preserved items.

**Test scenarios:**
- Happy path: typing `sudo` in the terminal prints three lines with item #3 reading `    #3) spiderman`.
- Happy path: subsequent prompt for password still appears (handler unchanged).

**Verification:**
- Manual smoke in browser: open Terminal app, type `sudo`, observe lecture text.

---

- [ ] **Unit 2: tools.ts + CLAUDE.md review-bundle nits** (closes #155)

**Goal:** Land all six review-feedback fixes from #149 review as one polish PR.

**Requirements:** R7

**Dependencies:** None.

**Files:**
- Modify: `src/data/tools.ts` — 1Password tagline reword; non-breaking-space split fix in `findTool`'s split regex; `Math.max(...)` empty-spread → `reduce` in `printToolDetail`. Document `aliases` strings as display-only in a leading comment block
- Modify: `src/data/dotfiles/claude-md.md` — qualify the `terraform plan` "always allowed" line per the issue's wording
- Modify: terminal input element — find the `<input>` in the terminal markup (likely `src/components/desktop/apps/Terminal.astro` or its scoped script) and add `maxlength="1024"`

**Approach:**
- Each fix is independent. Land all six in one squash-commit because they share an origin (one review).
- Decision per Key Technical Decisions: `aliases` field stays string-shaped; only the doc comment changes.

**Patterns to follow:**
- `findTool` already tolerates parenthetical decoration in `aliases` strings; keep that contract.
- `tools.ts` has a top-of-file comment block — extend it with the alias-shape note.

**Test scenarios:**
- Happy path: `tools 1password` prints the new, accurate tagline.
- Happy path: `tools  ` (NBSP, common on mobile) does NOT print "unknown tool:  " — should be treated as whitespace and print the help index.
- Happy path: `tools` with an entry that has zero examples renders without throwing (`reduce` initial value 0).
- Edge case: terminal input rejects pasting > 1024-character payload (input truncates / browser blocks).
- Happy path: `cat ~/.claude/CLAUDE.md` (or whichever path the dotfile mirror uses) shows the updated `terraform plan` qualifier.

**Verification:**
- Manual smoke: each finding above verified in browser.
- `npm run check` clean.

---

- [ ] **Unit 3: Wire `.motif-chrom` + `.motif-scanlines` utilities** (closes #158)

**Goal:** Make the two unused motif utilities actually fire on the surfaces the spec called out, so the chrome design intent is realized rather than dead-code.

**Requirements:** R13

**Dependencies:** None.

**Files:**
- Modify: `src/components/desktop/Titlebar.astro` (or wherever the active-window titlebar text lives) — add `class="motif-chrom"` to the title text element
- Modify: `src/components/desktop/Taskbar.astro` (or the clock fragment) — add `class="motif-chrom"` to the clock element
- Modify: `src/components/desktop/StartMenu.astro` (or its header) — add `class="motif-chrom"` to the header title
- Modify: `src/components/desktop/apps/Terminal.astro` (the scoped `<style>` block where `.term__crt::before` lives) — switch to consuming `.motif-scanlines` markup (or apply the utility class to the CRT overlay element instead of inlining the gradient)
- Modify: `src/styles/desktop.css` — only if any selector tweaks are needed once consumers exist; ideally untouched

**Approach:**
- This is a pure wire-up — no new tokens, no behavior change.
- For `.motif-chrom`, verify the `:hover`/`:focus-visible` rule actually paints chromatic aberration on at least one of the three surfaces (titlebar text is the most visible).
- For `.motif-scanlines`, the cleanest move is to give Terminal's CRT overlay element the class and remove the inlined `var(--scanlines)` gradient from its scoped CSS.
- Verify `prefers-reduced-motion` and `prefers-contrast` rules in `desktop.css` still do the right thing now that consumers exist.

**Patterns to follow:**
- `.motif-grain` mounted once in `DesktopLayout.astro` is the live exemplar.
- Spec: `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md` §3 (Motif infrastructure).

**Test scenarios:**
- Happy path: hovering an active window's titlebar text shows the chromatic aberration effect.
- Happy path: taskbar clock shows the chromatic aberration on focus / hover.
- Happy path: start menu header shows the chromatic aberration when the menu is open.
- Happy path: Terminal CRT overlay still renders scanlines, identical visual result to today.
- Edge case: with `prefers-reduced-motion: reduce`, chromatic aberration is suppressed (rule already exists in `desktop.css`).
- Edge case: with `prefers-contrast: more`, scanlines + grain are suppressed.

**Verification:**
- `npm run build` clean (catches any PostCSS regression).
- Manual visual check in browser, including DevTools "Emulate CSS media feature" for the two `prefers-*` rules.

---

- [ ] **Unit 4: Derive `dotfiles` index from `virtualFs`** (closes #154)

**Goal:** Eliminate the manually-maintained `DOTFILE_INDEX` shadow array; derive the listing at runtime from `virtualFs`.

**Requirements:** R6

**Dependencies:** None.

**Files:**
- Modify: `src/data/virtual-fs.ts` — optionally add a `description?: string` field to `Entry` for dotfile rows (per the issue's "or" suggestion)
- Modify: `src/scripts/terminal/commands/basic.ts` — replace `DOTFILE_INDEX` with a derivation function that walks `virtualFs` for `/home/mills/.<name>` files

**Approach:**
- Pick the simpler of the two issue-suggested shapes: (a) keep descriptions in a `Record<string, string>` map in `basic.ts` and walk `virtualFs` to filter dot-prefixed files under `/home/mills/`, OR (b) move descriptions into `Entry.description`.
- (b) is cleaner long-term but mutates the shared `Entry` type, which has more consumers than just the terminal. (a) is local to the command. Recommend (a) first; revisit (b) if a future feature wants per-entry metadata anywhere else.
- Filter rule: `path.startsWith('/home/mills/')` AND segment after `/home/mills/` starts with `.` AND `entry.type === 'file'`. This auto-includes `.zshrc`, `.tmux.conf`, etc., AND auto-includes anything new added under `/home/mills/.config/<name>/` if the issue adds nested-dir support; verify the listing is what the user expects before committing.

**Patterns to follow:**
- Existing `virtualFs` walk in `src/scripts/terminal/filesystem.ts` (the adapter from the original 5c spec).

**Test scenarios:**
- Happy path: `dotfiles` command output lists exactly the dot-prefixed files currently visible in `~/.dotfiles/` listing.
- Happy path: adding a new `/home/mills/.foo` entry to `virtualFs` makes `dotfiles` list it on the next render with no other code change.
- Happy path: removing an entry from `virtualFs` removes it from the `dotfiles` listing.
- Edge case: a dot-prefixed *directory* (e.g., `/home/mills/.config/`) does not appear as a file row.
- Edge case: a non-dot file under `/home/mills/` (e.g., `/home/mills/about.txt`) does not appear.

**Verification:**
- Manual smoke: `dotfiles` output matches expectations.
- `npm run check` clean.

---

- [ ] **Unit 5: PGP — unify `downloadPath` consumers + add CI consistency check** (closes #151, #152)

**Goal:** Make all four PGP-path consumers read `pgp.downloadPath` from `src/data/pgp.ts`, and add a CI assertion that `pgp.asc`, the WKD binary, and `pgp.ts` fingerprint stay in sync.

**Requirements:** R4, R5

**Dependencies:** None.

**Files:**
- Modify: `src/components/desktop/apps/About.astro` — replace hardcoded `href="/pgp.asc"` with `href={pgp.downloadPath}`
- Modify: `src/components/desktop/apps/Mail.astro` — same
- Modify: `src/pages/.well-known/security.txt.ts` — replace `Encryption: ${origin}/pgp.asc` with `Encryption: ${origin}${pgp.downloadPath}`
- Decide on `pgp.email`: either consume in `security.txt.ts` (alongside the existing `new URL(origin).hostname` derivation) or remove the unused export. Recommend remove — it's currently dead code, and `security.txt.ts`'s origin-derived path is correct
- Optional: add `src/components/desktop/PgpFingerprint.astro` shared component if the About/Mail fingerprint blocks are visually identical (they are, per the issue). One file, ~20 lines
- Create: `scripts/assert-pgp-consistency.sh` — fingerprint-in-`pgp.ts` matches `pgp.asc` AND WKD binary matches `pgp.asc`
- Modify: `scripts/ci-local.sh` — invoke `assert-pgp-consistency.sh` alongside the existing assertions

**Approach:**
- Land both halves together — the CI check is dead weight if consumers don't read the constants, and the consumer migration leaves a footgun unless CI catches drift.
- For the consistency check, prefer parsing `pgp.ts`'s fingerprint via a small Node one-liner (`node -p "require('./src/data/pgp.ts').pgp.fingerprint"`) over a fragile grep. If TS imports prove painful in shell, fall back to a literal `grep -oP "fingerprint:\s*'\K[^']+" src/data/pgp.ts` and trim spaces — both are acceptable per the issue.
- The check should fail with a clear "re-run scripts/generate-wkd.sh" message when the WKD binary lags `pgp.asc`.

**Patterns to follow:**
- `scripts/assert-icon-assets-exist.sh` is the size and shape exemplar.
- `ci-local.sh` already invokes its assert-* siblings unconditionally.

**Test scenarios:**
- Happy path: `npm run build` produces working About, Mail, security.txt with `/pgp.asc` linked everywhere.
- Happy path: `scripts/assert-pgp-consistency.sh` exits 0 on the current tree.
- Error path: edit `pgp.ts` fingerprint to a wrong value → `assert-pgp-consistency.sh` exits non-zero with "fingerprint mismatch" message.
- Error path: regenerate `public/pgp.asc` from a different key without re-running `generate-wkd.sh` → `assert-pgp-consistency.sh` exits non-zero with "WKD binary fingerprint does not match" message.
- Integration: `scripts/ci-local.sh` runs the new check as part of the full pre-push suite.
- Happy path: removing the `pgp.email` export does not break any consumer (verify via `npm run check`).

**Verification:**
- `npm run build` clean.
- `scripts/ci-local.sh` clean on the current tree.
- Manual: visit About + Mail in dev server, click the "/pgp.asc" link, confirm the file downloads.
- Manual: `curl -sS http://localhost:4321/.well-known/security.txt` shows `Encryption: ...` with the correct path.

---

- [ ] **Unit 6: Publish age public key alongside PGP** (closes #174)

**Goal:** Add an `age` recipient as a second key surface, alongside the PGP key. Surfaced in About, Mail, and the `pubkey` command.

**Requirements:** R2

**Dependencies:** Unit 5 (consumers reading from `pgp.ts` cleanly).

**Files:**
- Create: `public/age.pub` — single-line ASCII public key (input from mills, not generated by this PR)
- Modify: `src/data/pgp.ts` — add `age: { recipient: string, createdAt: string }` field. Per Key Technical Decisions, do NOT rename to `keys.ts`
- Modify: `src/components/desktop/apps/About.astro` — extend the keys block: PGP fingerprint chip + age recipient line, with `curl https://millsymills.com/age.pub` hint
- Modify: `src/components/desktop/apps/Mail.astro` — second line under email: age recipient
- Modify: `src/scripts/terminal/commands/basic.ts` — extend `pubkey` output: print PGP block (existing) then age block

**Approach:**
- The age recipient is a single-line `age1...` string — no fingerprint formatting, no expiry. Much simpler surface than PGP.
- Reuse the `<PgpFingerprint>` component (if shipped in Unit 5) as `<KeyChip>` style, or just inline the recipient — it's ~62 chars, fits on one line.
- Terminal `pubkey` output gets two visually-distinct sections with headers: `PGP:` and `age:` so users can tell what they're looking at.
- The `pubkey` command is plural ("public keys") so the name still works.

**Patterns to follow:**
- The PGP block layout in `pubkey` (Unit 5).
- The keys block in About.astro (Unit 5).

**Test scenarios:**
- Happy path: `curl http://localhost:4321/age.pub` returns the ASCII public key.
- Happy path: `pubkey` command output has both a PGP section and an age section, in that order.
- Happy path: About app shows both PGP fingerprint and age recipient without layout regression.
- Happy path: Mail app shows email, then PGP fingerprint, then age recipient.
- Edge case: if `pgp.age` is absent (old `pgp.ts`), all consumers degrade gracefully. Verify with a temporary `pgp.age = undefined` in dev.
- Integration: `npm run build` clean; `scripts/ci-local.sh` clean (PGP consistency check from Unit 5 still passes — age is independent).

**Verification:**
- `npm run check` + `npm run build` clean.
- Manual smoke: About, Mail, terminal `pubkey`, `/age.pub` URL.

---

- [ ] **Unit 7: vscode — `VfsNode` discriminated union + share `?raw` snippet allow-list** (closes #160, #161)

**Goal:** Tighten the vscode `VfsNode` type into a discriminated union (file | dir) so the compiler enforces invariants, and unify the `?raw`-import snippet list between `astro.config.mjs` and `src/scripts/vscode/file-tree.ts` so adding a new snippet without registering it for URL scrubbing fails diagnosably.

**Requirements:** R8, R9

**Dependencies:** None. (Independent of #170 shiki — but landing first means #170's editor.ts gets the cleaner type.)

**Files:**
- Modify: `src/scripts/vscode/types.ts` — split `VfsNode` into a discriminated union per the issue's example shape
- Modify: `src/scripts/vscode/file-tree.ts` — drop `?? []` on `children` and `!` on `content`; use the narrowing the union provides
- Modify: `src/scripts/vscode/editor.ts` — same; the `if (!node || node.type !== 'file')` guard now narrows for free
- Modify: `src/scripts/vscode/tabs.ts` — adjust if any code paths assumed shared shape
- Create: `src/scripts/vscode/snippet-sources.ts` — exports `VSCODE_SNIPPET_SOURCES: readonly string[]` containing the three URL-bearing `?raw` paths
- Modify: `src/scripts/vscode/file-tree.ts` — import paths from `snippet-sources.ts` (or keep `?raw` imports literal but assert each appears in the shared list at module load)
- Modify: `astro.config.mjs` — import `VSCODE_SNIPPET_SOURCES` and iterate that list in `scrubVscodeSnippets`

**Approach:**
- Issue #160 prefers (a) — single source of truth — over (b) — CI grep. Implement (a).
- The `?raw` import path syntax in TS doesn't accept dynamic specifiers, so `file-tree.ts` still has literal `?raw` imports; the assertion is "every literal `?raw` URL-bearing import has its bare path in `VSCODE_SNIPPET_SOURCES`." Enforce via a small module-load check, or by making `file-tree.ts` `?raw`-import via `await import(\`${path}?raw\`)` only for the URL-bearing files (less ideal for tree-shaking).
- Pragmatic shape: `snippet-sources.ts` exports the `as const` array; `file-tree.ts` imports the array AND has literal `?raw` imports; a lightweight check at the bottom of `file-tree.ts` asserts the literal paths are a subset of the array. If a new literal `?raw` import is added without registering, the check fires at module load and the dev server logs a clear error pointing here.
- Alternative cleaner path: import via the array AND `?raw` simultaneously — `import readme from \`${VSCODE_SNIPPET_SOURCES[0]}?raw\`` — but Vite needs the literal at build time, so this likely won't work. Keep the guard pattern.

**Patterns to follow:**
- The existing `astro.config.mjs:57-74` `scrubVscodeSnippets` plugin shape.
- `as const` array exports from `src/data/apps.ts`.

**Test scenarios:**
- Happy path: `npm run check` clean — no `!` or `?? []` regressions.
- Happy path: `npm run build` clean — Vite picks up `?raw` imports as before.
- Happy path: vscode.exe opens, file tree renders, opening `index.astro` shows scrubbed `<site>` placeholder where `https://millsymills.com` was.
- Error path: add a new `?raw` import for a fictitious URL-bearing snippet to `file-tree.ts` without registering in `snippet-sources.ts` → module-load assertion fires with a pointer at `snippet-sources.ts`.
- Error path: remove an entry from `snippet-sources.ts` while leaving its `?raw` import in `file-tree.ts` → assertion fires.
- Edge case: dir nodes attempting to access `.content` fail at compile time after the union split.
- Edge case: file nodes attempting to access `.children` fail at compile time.

**Verification:**
- `npm run check` clean.
- `npm run build` clean.
- `scripts/ci-local.sh` clean (existing `assert-no-url-leakage.sh` still passes).
- Manual: open vscode.exe, browse tree, open each snippet file, view rendered content has scrubbed URLs.

---

- [ ] **Unit 8: vscode — neon-noir token alignment** (closes #162)

**Goal:** Migrate `src/styles/vscode.css` from legacy tokens (`--ink`, `--cream`, `--pink-*`) to the neon-noir palette (`--ink-primary`, `--bg-edge`, `--bg-raised`, `--bg-void`, `--neon-pink-*`, `--neon-lilac`).

**Requirements:** R10

**Dependencies:** None. (Lands in any order; CSS-only.)

**Files:**
- Modify: `src/styles/vscode.css` (~331 lines)

**Approach:**
- Audit each `var(--*)` reference. Map per the issue's table: `--ink` → `--ink-primary`, cream backgrounds → `--bg-raised` or `--bg-edge`, activity/status bar backgrounds → `--bg-void` or a `--neon-pink-*` accent, kept typography tokens (`--font-mono`, `--font-screen`).
- Keep activity bar / status bar visually distinct from editor surface — they're the "chrome" of the chrome.
- Verify in browser at desktop and mobile viewports — no token swap should regress mobile 2-pane layout.
- Use the spec at `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md` as the cohesion target.
- CLAUDE.md note: `npm run check` does NOT run PostCSS — `npm run build` is the parser safety net for any CSS edit.

**Patterns to follow:**
- `src/components/desktop/apps/Privacy.astro` and `src/components/desktop/apps/Incidents.astro` already use the new palette — reference for what "neon-noir-correct" looks like for an info-dense app.

**Test scenarios:**
- Test expectation: none (purely visual). Replace with manual visual audit below.

**Verification:**
- `npm run build` clean (catches any PostCSS regression — critical here, see CLAUDE.md note).
- Manual: open vscode.exe in dev server next to Privacy / Incidents / Terminal — visual cohesion check, no off-theme cream surfaces remain.
- Manual: mobile viewport (iPhone 13 sim) — 2-pane layout intact.
- Manual: light + dark system themes if any media-query-based logic exists in `vscode.css` (verify nothing inverts).

---

- [ ] **Unit 9: security.txt scheduled rebuild** (closes #153, supersedes #175)

**Goal:** Guarantee `/.well-known/security.txt`'s `Expires:` field stays fresh by triggering a monthly build + deploy via GitHub Actions cron.

**Requirements:** R3

**Dependencies:** None.

**Files:**
- Create: `.github/workflows/scheduled-rebuild.yml` — cron + `workflow_dispatch` triggers, calls the same build + deploy steps as `deploy.yml`
- Modify: `CLAUDE.md` — add a one-liner under deploy notes documenting that the monthly cron exists and what it's for. Future-mills shouldn't be surprised by a "no-op" deploy showing up in CloudFront invalidation logs every month
- Optional: `.github/workflows/deploy.yml` — extract shared steps into a reusable workflow if the rebuild config copy-paste is large; otherwise duplicate

**Approach:**
- Two implementation shapes:
  - **(a) Reusable workflow:** Extract `deploy.yml`'s build + deploy job into `.github/workflows/_deploy.yml` and have both `deploy.yml` and `scheduled-rebuild.yml` `uses:` it. Cleanest, but requires touching deploy.yml — riskier.
  - **(b) Copy-paste:** `scheduled-rebuild.yml` duplicates the relevant steps from `deploy.yml`. Simpler, but two files to keep in sync. CI-local.sh's `deploy_workflow` validation in CLAUDE.md mentions OIDC trust pinning per workflow file — verify that pinning includes the new workflow before pushing.
- Recommend (a) for maintainability; fall back to (b) if extraction proves messy.
- The workflow targets the `production` GitHub Environment, same as `deploy.yml`. Required reviewers can stay (a manual approval per cron run is fine — once a month is not annoying, and it gives a visible signal).
- Cron: `0 3 1 * *` — 1st of each month, 03:00 UTC. Matches the issue's suggestion.
- After landing, close #175 with a comment: "Superseded by #<this PR>: scheduled rebuild keeps Expires fresh without moving the file out of static `public/`. Terraform-driven generation would require carving an exception in `aws s3 sync --delete`, which is a real footgun."
- Per CLAUDE.md: any new deploy workflow needs a matching `deploy_workflow = "<file>.yml"` line in the relevant stack's tfvars + `terraform apply` BEFORE the workflow lands. The scheduled rebuild ships to the prod environment; verify `infra/stacks/millsymills.tfvars` allows it (or add a second pinned workflow).

**Patterns to follow:**
- `.github/workflows/deploy.yml` — the build + deploy step shape, OIDC `AssumeRoleWithWebIdentity`, the `production` environment.

**Test scenarios:**
- Happy path: manually triggering `scheduled-rebuild.yml` via `workflow_dispatch` produces a successful build, sync, and CloudFront invalidation.
- Happy path: the rebuilt `https://millsymills.com/.well-known/security.txt` shows `Expires:` advanced to ~12mo from the rebuild date.
- Integration: the cron schedule fires correctly (verify via the next scheduled run after merge — manual confirmation).
- Error path: if OIDC trust isn't updated, the workflow fails with a clear `AssumeRoleWithWebIdentity` error. Catch this BEFORE pushing the workflow per the CLAUDE.md note.

**Verification:**
- `workflow_dispatch` smoke test on a feature branch (using a non-prod environment if possible).
- `curl -sS https://millsymills.com/.well-known/security.txt | grep Expires` after the first scheduled run, verify advancement.
- `scripts/ci-local.sh` clean — checks `deploy_workflow` referenced workflow file exists.

---

- [ ] **Unit 10: vscode shiki syntax highlighting** (closes #170)

**Goal:** Replace the plain-text editor pane in `vscode.exe` with shiki-rendered syntax highlighting, prerendered at build time so runtime cost is just CSS.

**Requirements:** R1

**Dependencies:** Unit 7 (`VfsNode` discriminated union — keeps `editor.ts` clean) and Unit 8 (neon-noir tokens — informs the shiki theme palette).

**Files:**
- Add dep: `shiki` (build-time only; not bundled into runtime)
- Create: `src/scripts/vscode/highlight-build.ts` — build-time shiki invocation; imports the snippet sources, runs each through shiki with the right grammar (per `Entry.language` hint), produces a `Record<string, string>` of prerendered HTML
- Modify: `src/scripts/vscode/editor.ts` — replace plain-text rendering with `innerHTML = prerendered[path] ?? plainTextFallback(content)`. Preserve the line-number gutter
- Modify: `astro.config.mjs` — invoke the build-time highlight pipeline; expose results via Vite `define` (similar pattern to `PUBLIC_GIT_SHA` / `PUBLIC_GIT_LOG`) — e.g., `import.meta.env.PUBLIC_VSCODE_HIGHLIGHTS`
- Create: `src/scripts/vscode/shiki-theme.ts` — hand-rolled theme keyed off `:root` design tokens, OR pick a stock dark theme that approximates neon-noir. Decide during prototyping
- Modify: `src/styles/vscode.css` — adjust `.editor` styles so shiki's wrapping `<pre>` + `<code>` sit correctly inside the existing line-number gutter layout

**Approach:**
- Build-time prerender per Key Technical Decisions: the vscode tree only opens 8–12 known files. Each one is highlighted at build time and shipped as a string in a Vite-defined object.
- Languages used (per `Entry.language` hint in `virtualFs`): `astro`, `typescript` (tsx for `.astro` is a reasonable cheat), `markdown`, `zsh` (or `bash`), `lua`, plain text.
- shiki's theme story: best result is a hand-rolled JSON theme keyed off the existing palette — it's ~50 lines and the visual cohesion is worth it. Stock `github-dark` or `dracula` are fallback options. Confirm during prototyping.
- Mobile fallback decision per "Deferred to Implementation": once landed bundle size is measurable, decide whether the mobile pane should skip highlighting. If shiki output is just inlined CSS-styled HTML strings (no JS), there's no runtime cost — keep it on mobile.
- Plain text stays the fallback for files without a language hint AND for runtime errors in the prerender pipeline (defensive).
- Keep `--font-mono` and the line-number gutter behavior as-is.

**Patterns to follow:**
- Build-time data injection via Vite `define` — see `PUBLIC_GIT_SHA` and `PUBLIC_GIT_LOG` in `astro.config.mjs`.
- `?raw` imports already power the file-tree snippet pipeline — the highlight pipeline can read the same source paths.

**Test scenarios:**
- Happy path: opening `apps.ts` in vscode.exe shows TypeScript-highlighted code with comments + strings + keywords colored.
- Happy path: opening `index.astro` shows astro/JSX-highlighted code.
- Happy path: opening `.zshrc` shows shell-highlighted code.
- Happy path: opening `init.lua` shows lua-highlighted code.
- Happy path: opening `git/config` shows ini-or-text-highlighted content.
- Happy path: opening `README.md` shows markdown-highlighted (headings, code blocks, links).
- Happy path: line-number gutter still renders 1, 2, 3, ... and stays aligned with code lines.
- Edge case: a file with `language: 'text'` (or no language hint) renders as plain-text in the same monospace font, no shiki errors thrown.
- Edge case: a runtime error in the prerender pipeline (e.g., shiki fails to load a grammar at build time) doesn't break the build — fall back to plain text and log a warning.
- Integration: `npm run build` succeeds, `dist/` size delta is acceptable (target: <100KB additional gzip for the prerendered HTML strings combined).
- Edge case: route bundle size for non-`/vscode/` routes is unchanged — confirm shiki doesn't leak into other route bundles.

**Verification:**
- `npm run build` clean.
- `npm run preview`, open `/vscode/`, verify each acceptance-criteria file renders with appropriate highlighting.
- Bundle audit: `du -sh dist/_astro/*.js` before/after, route-by-route.
- Mobile viewport check: still renders, no visual regression.

---

- [ ] **Unit 11: Hide flag UI until first capture, then celebrate** (closes #146)

**Goal:** Pre-capture desktop has zero flag-related UI. First capture fires a prominent celebration banner and unlocks all the gated UI in place, no reload.

**Requirements:** R11

**Dependencies:** None functionally; recommend landing late so it doesn't gate other work.

**Files:**
- Modify: `src/data/apps.ts` — make the `flags` entry conditional, OR have the desktop renderer filter it out pre-capture (cleaner; keep the entry static but introduce a renderer-time visibility gate)
- Modify: `src/components/desktop/HelpOverlay.astro` — gate the flag-related lines (#16-17, #40-41, #47, the `/flags/` deep-link) behind the unlock signal
- Modify: `src/scripts/command-palette.ts` — gate the `"reveal hidden flag"` result and its trigger queries
- Modify: `src/scripts/terminal/commands/basic.ts` — gate `flag` from `help` listing and tab-completion; keep the command itself executable
- Modify: `src/components/desktop/ResetConfirm.astro` — remove the "captured CTF flags" line and "find every flag again" copy. Reset still clears `mills.flags.v1`, just doesn't name it
- Modify: `src/components/desktop/apps/Flags.astro` — render a neutral placeholder pre-capture (no `0 / N` counter, no challenge list)
- Modify: `src/scripts/flags.ts` — first-capture detection + banner trigger + unlock-broadcast event
- Modify: `src/styles/desktop.css` — extend `.flag-toast` with a `[data-first-capture]` variant for the larger alert-style banner
- Modify: `src/scripts/util/events.ts` — add (or reuse existing) "flags-unlocked" event for the live unlock without reload
- Each gated UI surface listens to "flags-unlocked" and re-renders / shows itself

**Approach:**
- Unlock predicate: derive from `mills.flags.v1` — "≥1 entry" is the gate. No new localStorage key, no privacy-page update needed.
- First-capture detection: in `flags.ts`'s capture handler, before persisting the new flag, check if the existing capture set is empty. If so, this is the first capture → emit "flags-unlocked" + render the banner. After persistence, subsequent captures emit normal toast.
- Banner styling: extend `.flag-toast` with `[data-first-capture]` for size, color, and dismiss button. One CSS module, two states.
- Live unlock without reload: every gated surface either subscribes to "flags-unlocked" and re-renders, OR uses CSS `[data-flags-unlocked]` body attribute that flips on capture.
- The body-attribute approach is simpler — set `data-flags-unlocked="true"` on `<body>` from `flags.ts` initialization (read from store) and on first capture. Gated surfaces use `body[data-flags-unlocked]` selectors to show/hide. Markup stays simple, no JS subscription needed for the visual gating.
- For the launcher entry (apps.ts), the desktop renderer reads the body attribute (or the store directly) at render time and filters the array.
- For the command palette and terminal `help`, those generate their results dynamically — they read the store at query time.
- Out of scope per the issue: do not remove the flag-bearing meta tags / HTML comments / devtools console banner / llms-full.txt content. Those ARE flags, not references to them.
- Sitemap tension: per "Deferred to Implementation," recommend leaving `/flags/` in `sitemap.xml` and noting the tension in `/security` colophon when that page ships. Confirm during implementation.

**Patterns to follow:**
- `src/scripts/util/events.ts` event bus — used by other unlock-style flows.
- Body data attributes for global UI mode — verify this pattern is in use elsewhere; if not, this is its introduction. CSS-driven visibility is the right tool here.
- `.flag-toast` existing styling at `src/styles/desktop.css:784-813` — extend, don't fork.

**Test scenarios:**
- Happy path: fresh profile (cleared storage) → no `flags.exe` icon on desktop, no `🚩` glyph anywhere, no "flag" or "CTF" strings in the rendered HTML, no flag entry in command palette suggestions, no flag command in terminal `help`, ResetConfirm dialog has no flag-related copy, opening `/flags/` directly shows a neutral placeholder.
- Happy path: capturing any one flag → celebration banner fires, dismiss button works, body gains `data-flags-unlocked`, launcher entry appears, help overlay updates, terminal `help` now lists `flag`, command palette finds the egg.
- Happy path: capturing a second flag → small toast (existing behavior), no banner.
- Happy path: reset → body loses `data-flags-unlocked`, all gated UI hides again.
- Edge case: the `flag` command itself still executes when typed pre-capture (gate the listing, not the command).
- Edge case: opening `/flags/` URL pre-capture — placeholder, not the full UI.
- Edge case: HelpOverlay's `/flags/` deep-link — hidden pre-capture.
- Integration: view-source pre-capture → no `flags.exe`, `CTF`, `flag status` strings in HTML or client JS bundles. Some strings will exist in the bundle (the unlock predicate has to know what to gate), but they should not appear in user-visible rendered HTML or in obvious string literals reachable without flag knowledge.
- Integration: layout, motif, chrome, and other desktop apps render identically pre- and post-unlock — no surprise reflow.

**Verification:**
- Manual smoke: fresh-profile + flag-capture + reset cycle in browser.
- View-source check pre-capture per the issue's QA note.
- `npm run check` clean.
- `npm run build` clean.

## System-Wide Impact

- **Interaction graph:**
  - Unit 5/6/10: `src/data/pgp.ts` is read by 4+ consumers; changing its shape is a fan-out point — verified each consumer in the unit's file list
  - Unit 7: `VfsNode` consumers across `src/scripts/vscode/` — all listed in the unit's files
  - Unit 11: flag UI gating crosses launcher, help overlay, command palette, terminal, ResetConfirm, Flags app, and the styling layer — large interaction graph, deliberately concentrated in one PR so reviewers see the full surface
- **Error propagation:**
  - Unit 5's CI assertion fails the pre-push pipeline if PGP artifacts drift — intended
  - Unit 7's snippet-allow-list assertion fires at module load (not at build time) — error visible in dev server logs
  - Unit 9's monthly cron failure should produce a GitHub Actions notification; verify alerting is not silently dropped
  - Unit 10's shiki prerender errors fall back to plain text + warning log (defensive); intentional that a missing grammar doesn't break the build
- **State lifecycle risks:**
  - Unit 11's `data-flags-unlocked` attribute must be set on body before the first paint to avoid a flash-of-flag-UI for users with captures. Verify the body attribute is set during initialization (sync read from `mills.flags.v1`), not after async resolution
  - Unit 6's `pgp.age = undefined` graceful fallback: confirm during dev so an in-progress age field doesn't crash About/Mail
- **API surface parity:**
  - Unit 5's PGP-path unification: every consumer of the path is in the unit's file list. If a future consumer is added (e.g., a new `Resume.astro` linking to the key), it should also read `pgp.downloadPath` — call this out in the PR description
  - Unit 7: any future `?raw` import that bears `https://millsymills.com` must be added to `VSCODE_SNIPPET_SOURCES` AND `file-tree.ts` — the assertion enforces this
- **Integration coverage:**
  - Unit 5's CI assertion is integration-tested by intentionally drifting `pgp.ts` and re-running `ci-local.sh`. Documented in unit's test scenarios
  - Unit 9's cron is verified by the next scheduled run — this is the real test
  - Unit 11's first-capture banner is verified by clearing storage and tripping a flag — manual integration test, no automation
- **Unchanged invariants:**
  - The `pubkey` terminal command name stays unchanged (Unit 6) — third-party shell history / docs aren't broken
  - The `/pgp.asc` URL path stays unchanged (Unit 5) — only the source-of-truth is centralized; external consumers of the URL are unaffected
  - Capture detection logic in `flags.ts` is unchanged (Unit 11) — only first-capture *messaging* + UI gating are added
  - `/flags/` route still exists (Unit 11) — only the contents of `Flags.astro` change pre-capture; the route is reachable
  - `Entry` type in `src/data/virtual-fs.ts` is unchanged (Unit 4 keeps descriptions in a separate map; Unit 7 only touches the local `VfsNode` mirror inside vscode)
  - The neon-noir `:root` token set is unchanged (Unit 8 only consumes existing tokens; #156/#157 propose new tokens but are out of scope)

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Unit 9's GitHub Actions cron creates monthly CloudFront invalidations + (small) S3 PUT charges | Acceptable — the cost is dollar-per-year scale; documented in CLAUDE.md |
| Unit 9 changes the deploy-workflow surface; OIDC trust + `deploy_workflow` tfvar must be updated FIRST | CLAUDE.md already calls this out; gate the workflow PR on tfvar apply landing first; `ci-local.sh` checks the referenced workflow exists |
| Unit 10 (shiki) bundle bloat on non-vscode routes | Build-time prerender approach guarantees zero runtime shiki on any route; verify with bundle audit |
| Unit 11 pre-capture flash-of-flag-UI | Set `data-flags-unlocked` body attribute synchronously at script init; document in unit's verification steps |
| Unit 11 search-source hides too much, hurting share-ability of `/flags/` URL | Issue resolves: keep sitemap entry, document in `/security` colophon when that ships |
| Unit 5 changes break the PGP page in production if generate-wkd.sh isn't re-run after a real key rotation | The new CI assertion in Unit 5 is *the* mitigation — it fires before merge |
| Unit 6 ships `public/age.pub` with mills's actual age public key — not generated by the implementer | Mark in PR description; key generation happens out-of-band; no key rotation automation in this plan |
| Unit 8 token swap accidentally regresses contrast on accessibility thresholds | Manual verification step in unit; spot-check with browser contrast checker |
| Several units could conflict if landed in arbitrary order (e.g., Unit 7 before Unit 10) | Order documented in unit dependencies; reviewer should rebase later units on `main` after earlier units merge |

## Documentation / Operational Notes

- **CLAUDE.md updates needed:**
  - Unit 9: note the monthly scheduled rebuild cron and its purpose under the deploy-workflow section
  - Unit 5: note the PGP consistency check addition to `ci-local.sh`
  - Unit 2: the `terraform plan` qualifier in `src/data/dotfiles/claude-md.md` (the dotfile mirror) — verify this is in sync with the canonical `CLAUDE.md` at the repo root, or pick the canonical one
- **Issue closures:**
  - #153 closes via Unit 9; #175 closes by comment ("superseded by #<Unit 9 PR>")
  - #160, #161 close via Unit 7 (one PR, two issue refs in the squash commit)
  - #151, #152 close via Unit 5 (one PR, two issue refs)
  - All other units close their single referenced issue
- **PR review:**
  - Each PR opens, runs `/pr-review` standardly. No retrospective review of #177–#181 is in scope (per user clarification).
  - Reviews from any of these PRs that surface new follow-up issues should be filed as new GitHub issues for a future "Phase 5d" cleanup pass — don't expand scope of any unit mid-flight.
- **Squash-commit format:**
  - Per CLAUDE.md: `<type>(<scope>): <summary> (#<pr>)`. Examples: `feat(vscode): shiki syntax highlighting (#170)`, `fix(pgp): unify downloadPath consumers + CI consistency check (#151, #152)`, `chore(terminal): sudo lecture #3 → spiderman (#148)`.

## Sources & References

- **Origin document:** [docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md](../superpowers/specs/2026-04-20-phase-5c-batch-design.md)
- **Per-PR plans from the original 5c batch:**
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr1-shared-infra.md`
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr2-dotfiles.md`
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr3-privacy.md`
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr4-incidents.md`
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr5-pgp.md`
  - `docs/superpowers/plans/2026-04-20-phase-5c-pr6-vscode.md`
- **Vaporwave chrome spec:** `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md`
- **Best practice:** `docs/solutions/best-practices/universal-desktop-shell-per-page-changes-2026-04-24.md`
- **Issues this plan resolves:**
  - Deferred from spec: #170 (shiki), #174 (age key), #175 (security.txt Terraform — closed as superseded by #153)
  - PGP review follow-ups: #151, #152
  - vscode review follow-ups: #160, #161, #162
  - Terminal/docs review follow-ups: #154, #155
  - 5c-flavored UX: #146 (flag UI hide), #148 (sudo spiderman), #158 (motif wire-up)
  - Reliability bundle: #153 (security.txt cron — implements R3)
- **Recently merged 5c PRs (context only — not reviewed in this plan):** #112, #122, #147, #149, #150, #159, #167, #168, #169, #177, #178, #179, #180, #181, #182
