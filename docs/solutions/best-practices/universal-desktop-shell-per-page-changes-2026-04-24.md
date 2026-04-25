---
title: Per-page changes need cross-app audits — the desktop shell is universal
date: 2026-04-24
category: best-practices
module: desktop-shell
problem_type: best_practice
component: documentation
severity: medium
applies_when:
  - Adding a window/document event listener inside any app component
  - Scrubbing or gating sensitive strings (emails, tokens) out of build output
  - Editing DesktopLayout.astro, src/data/apps.ts, or src/data/tools.ts
  - Adding side-effecting `<script>` or hydration to an app
  - Reviewing a PR whose diff "only" touches one app but adds runtime behavior
related_prs:
  - "#179"
  - "#181"
related_issues:
  - "#47"
  - "#64"
affected_files:
  - src/components/desktop/Desktop.astro
  - src/components/desktop/MobileFallback.astro
  - src/data/apps.ts
tags:
  - astro
  - universal-layout
  - per-page-changes
  - desktop-shell
  - mount-duplication
  - gotchas
---

# Per-page changes need cross-app audits — the desktop shell is universal

## Context

`millsymills.com` is an Astro static site that emulates a vaporwave desktop OS. Every Astro page route (`/`, `/about/`, `/mail/`, `/vscode/`, etc.) renders the **same universal shell** containing **every app**. Both `src/components/desktop/Desktop.astro` and `src/components/desktop/MobileFallback.astro` import all ~14 app components (About, Mail, Trash, VSCode, Music, Memes, Photos, Projects, Resume, Uses, Flags, Incidents, Privacy, Terminal). The "current" app for a given route is selected purely by CSS visibility — non-current apps are hidden, not omitted.

This gives the site its single-page-app desktop feel without client-side routing: switching apps is just toggling visibility on already-mounted markup. It also means the build attestation (PUBLIC_GIT_SHA) and other layout-level signals appear on every route — a "bonus" property called out during privacy-feature review (session history). The unavoidable consequence: **anything you change on one app's page is, in a literal HTML/DOM sense, also present on every other page**, and most components are mounted **twice** (Desktop + MobileFallback).

## Guidance

Before merging anything that scopes itself to one app, run this checklist:

1. **HTML scrubs / gates.** `grep` the built artifact across **all** `dist/*/index.html`, not just the target route. If the string appears anywhere else, find every component that emits it.
2. **Window-level listeners** (`window.addEventListener`, `document.addEventListener`). Assume your component is mounted twice. Gate the handler on a *visibility* check, not just a focus check:
   ```ts
   // src/scripts/vscode/quick-open.ts
   function isActiveMount() {
     return isFocused() && root.offsetParent !== null;
   }
   ```
   `offsetParent === null` for any element inside a `display:none` ancestor, so the hidden mount silently no-ops.
3. **DOM lookups by ID.** `getElementById` silently returns the first match. If two mounts both contain the same id, mobile loses. Prefer scoped traversal — `row.closest('ul').nextElementSibling`, `root.querySelector(...)`, etc. — anything that doesn't depend on the mount count.
4. **Layout-level data** in `DesktopLayout.astro`, `src/data/apps.ts`, `src/data/tools.ts`. These render into every page. Sensitive strings here leak everywhere; treat edits to them as site-wide.
5. **Asset references.** An `<img src="…">` inside an app component is fetched **twice per route** unless lazy-loaded. Add `loading="lazy" decoding="async"` for non-hero imagery (this was the resolution path for #64).

## Why This Matters

The pattern has bitten this project at least four times — twice in one session before being named:

- **#47 (closed)** — Duplicate `id="garbage-file"` broke the Trash CTF flag on mobile. `Trash.astro` is rendered by both shells; `getElementById` hit only the first. Fixed by dropping the `id` and switching to scoped DOM traversal *(session history: April 20, 2026)*.
- **#64 (closed)** — Apps double-rendered, every image fetched twice. Discovered from paired 404 log lines. Fixed with `loading="lazy" decoding="async"` on all `<img>` tags — symptom-level, not architectural *(session history: April 20-21, 2026)*.
- **PR #179** — vscode.exe Cmd-P quick-open registered a window-level keydown listener; both Desktop and MobileFallback mounts initialized; every keypress fired both, opening duplicate palettes. Fixed by adding `root.offsetParent !== null` to the focus check.
- **PR #181** — Goal was to scrub `mills@millsymills.com` from `dist/mail/index.html`. First attempt gated only `Mail.astro`. The plaintext still appeared **7 times** because the universal shell was rendering About.astro's mailto link, `DesktopLayout.astro`'s JSON-LD `Person.email`, and a GnuPG entry in `tools.ts` (tagline + example shell command). Real fix scrubbed all four surfaces.

Prior fixes treated each bug as isolated. None named the underlying pattern, so the next instance landed by surprise *(session history: April 17–25, 2026; pattern was never articulated in any prior session)*.

## When to Apply

- Adding any `window` / `document` event listener inside an app component.
- Scrubbing or gating sensitive strings out of build output.
- Editing `DesktopLayout.astro`, `src/data/apps.ts`, or `src/data/tools.ts`.
- Adding side-effecting `<script>` or `client:load` hydration to an app.
- Reviewing a PR whose diff "only" touches one app component but adds runtime behavior.
- Wiring a new app: per the existing per-PR plans for #41/#43/#44/#45, you must register in **both** `Desktop.astro` and `MobileFallback.astro`.

## Examples

### 1. Cmd-P quick-open (PR #179)

Before — handler fires in both mounts, opens duplicate palettes:
```ts
function isActiveMount() {
  return isFocused();
}
window.addEventListener('keydown', (e) => {
  if (!isActiveMount()) return;
  // open palette …
});
```

After — hidden mount no-ops because `offsetParent` is `null` inside `display:none`:
```ts
function isActiveMount() {
  return isFocused() && root.offsetParent !== null;
}
```

### 2. Mail PoW scrub scope (PR #181)

Before — only `Mail.astro` gated:
```bash
$ grep -c mills@millsymills.com dist/mail/index.html
7
```

After — scrubbed `Mail.astro` PoW gate + `About.astro` PoW gate + JSON-LD `email` field in `DesktopLayout.astro` + GnuPG entry placeholders in `src/data/tools.ts`:
```bash
$ grep mills@millsymills.com dist/*/index.html
# 0 hits across every page
```

### 3. CTF flag DOM lookup (#47)

Before — `getElementById` silently hits first mount only:
```ts
const row = document.getElementById('garbage-file');
```

After — scoped traversal that works regardless of mount count:
```ts
const row = trigger.closest('ul')?.nextElementSibling;
```

The lesson all four encode: **on this site, "per-page" is a UI illusion. Every page is every page, and most components are mounted twice.**

## Related

- PR #179 — vscode.exe Cmd-P quick-open (visibility-gated keydown)
- PR #181 — mail PoW gate (cross-app email scrub)
- Issue #47 — duplicate id breaks CTF flag on mobile (closed)
- Issue #64 — double image fetch from dual mount (closed)
- `docs/superpowers/specs/2026-04-20-icon-pack-wire-up-design.md` — the clearest existing prose naming the two render sites
- `docs/superpowers/plans/2026-04-20-phase-5c-pr3-privacy.md`, `…-pr4-incidents.md`, `…-pr6-vscode.md` — examples of the "wire into both shells" checklist in action
