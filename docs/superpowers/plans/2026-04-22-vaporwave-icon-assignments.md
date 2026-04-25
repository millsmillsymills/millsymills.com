# Vaporwave icon assignments — about / incidents / privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three icons from the Downloads "VAPORWAVE USER INTERFACE" pack onto the `about`, `incidents`, and `privacy` desktop apps, replacing their emoji-glyph fallback.

**Architecture:** Asset + data change only. No new components, no new tests. Copy three PNGs from `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/` into `public/images/icons/vaporwave/` under descriptive filenames, then add an `iconUrl` line to three entries in `src/data/apps.ts`. The `DesktopIcon` and mobile-shell render paths already branch on `iconUrl`, so no UI code changes.

**Tech Stack:** Astro 6 (static site), TypeScript, plain PNG assets served from `public/`.

**Spec:** [`docs/superpowers/specs/2026-04-22-vaporwave-icon-assignments-design.md`](../specs/2026-04-22-vaporwave-icon-assignments-design.md)

**TDD note:** No new tests. This is a data/asset change where the testable surface (does `iconUrl` render?) is already covered by the existing icon-pack wire-up. Verification is `npm run check`, `npm run build`, and manual visual confirmation via `npm run dev`.

---

## File Structure

**Create (new assets):**
- `public/images/icons/vaporwave/crest.png` — copied from `vaporwave ui_misc icon-22.png`
- `public/images/icons/vaporwave/warning-triangle.png` — copied from `vaporwave ui_misc icon-13.png`
- `public/images/icons/vaporwave/keyed-file.png` — copied from `vaporwave ui_misc icon-12.png`

**Modify:**
- `src/data/apps.ts` — add `iconUrl` to three entries (`about`, `incidents`, `privacy`)

**Do NOT touch:**
- `vscode` entry in `src/data/apps.ts`. Out of scope per the spec; user is filing a separate issue.

---

### Task 1: Copy the three PNG assets

**Files:**
- Create: `public/images/icons/vaporwave/crest.png`
- Create: `public/images/icons/vaporwave/warning-triangle.png`
- Create: `public/images/icons/vaporwave/keyed-file.png`

- [ ] **Step 1: Copy `icon-22` → `crest.png`**

Run from the repo root:

```bash
cp "/Users/mills/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-22.png" public/images/icons/vaporwave/crest.png
```

- [ ] **Step 2: Copy `icon-13` → `warning-triangle.png`**

```bash
cp "/Users/mills/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-13.png" public/images/icons/vaporwave/warning-triangle.png
```

- [ ] **Step 3: Copy `icon-12` → `keyed-file.png`**

```bash
cp "/Users/mills/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-12.png" public/images/icons/vaporwave/keyed-file.png
```

- [ ] **Step 4: Verify all three destination files exist and are non-empty**

```bash
ls -l public/images/icons/vaporwave/crest.png public/images/icons/vaporwave/warning-triangle.png public/images/icons/vaporwave/keyed-file.png
```

Expected: three entries, each a few KB in size. `crest.png` ≈ 3.9KB, `warning-triangle.png` ≈ 2.2KB, `keyed-file.png` ≈ 3.0KB (matches source byte counts from `~/Downloads`).

If any file is missing or zero bytes, fix the `cp` command and rerun before continuing.

---

### Task 2: Wire `iconUrl` onto the `about` app

**Files:**
- Modify: `src/data/apps.ts` (the `about` entry, starts around line 28)

- [ ] **Step 1: Add `iconUrl` line to the `about` entry**

Edit `src/data/apps.ts`. Locate the `about` entry (object with `id: 'about'`). Insert one new line between the existing `glyph:` line and the existing `title:` line, matching the tab-indented style of the surrounding code.

Before:
```ts
	{
		id: 'about',
		label: 'about.me',
		glyph: '🪪',
		title: 'about.exe',
```

After:
```ts
	{
		id: 'about',
		label: 'about.me',
		glyph: '🪪',
		iconUrl: '/images/icons/vaporwave/crest.png',
		title: 'about.exe',
```

- [ ] **Step 2: Confirm the edit landed**

```bash
grep -n "crest.png" src/data/apps.ts
```

Expected: exactly one match, inside the `about` entry.

---

### Task 3: Wire `iconUrl` onto the `incidents` app

**Files:**
- Modify: `src/data/apps.ts` (the `incidents` entry, starts around line 136)

- [ ] **Step 1: Add `iconUrl` line to the `incidents` entry**

Edit `src/data/apps.ts`. Locate the `incidents` entry (object with `id: 'incidents'`). Insert one new line between the existing `glyph:` line and the existing `title:` line.

Before:
```ts
	{
		id: 'incidents',
		label: 'incidents',
		glyph: '🚨',
		title: 'incidents.log',
```

After:
```ts
	{
		id: 'incidents',
		label: 'incidents',
		glyph: '🚨',
		iconUrl: '/images/icons/vaporwave/warning-triangle.png',
		title: 'incidents.log',
```

- [ ] **Step 2: Confirm the edit landed**

```bash
grep -n "warning-triangle.png" src/data/apps.ts
```

Expected: exactly one match, inside the `incidents` entry.

---

### Task 4: Wire `iconUrl` onto the `privacy` app

**Files:**
- Modify: `src/data/apps.ts` (the `privacy` entry, starts around line 158)

- [ ] **Step 1: Add `iconUrl` line to the `privacy` entry**

Edit `src/data/apps.ts`. Locate the `privacy` entry (object with `id: 'privacy'`). Insert one new line between the existing `glyph:` line and the existing `title:` line.

Before:
```ts
	{
		id: 'privacy',
		label: 'privacy',
		glyph: '🔒',
		title: 'privacy.txt',
```

After:
```ts
	{
		id: 'privacy',
		label: 'privacy',
		glyph: '🔒',
		iconUrl: '/images/icons/vaporwave/keyed-file.png',
		title: 'privacy.txt',
```

- [ ] **Step 2: Confirm the edit landed**

```bash
grep -n "keyed-file.png" src/data/apps.ts
```

Expected: exactly one match, inside the `privacy` entry.

- [ ] **Step 3: Confirm `vscode` was NOT modified**

```bash
grep -n "id: 'vscode'" -A 6 src/data/apps.ts
```

Expected: the `vscode` entry still has no `iconUrl:` line, and its `glyph: '🆅'` is unchanged. The spec deliberately leaves `vscode` alone.

---

### Task 5: Typecheck and build

**Files:** none (commands only)

- [ ] **Step 1: Run the Astro typechecker**

```bash
npm run check
```

Expected: `0 errors, 0 warnings` (or whatever the clean baseline was before this change — if the baseline already has warnings, this change must not add new ones). Because `AppDef.iconUrl` is already optional and typed as `string`, this should pass without incident.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: build completes successfully, and the output mentions that `public/images/icons/vaporwave/crest.png`, `warning-triangle.png`, and `keyed-file.png` were copied into `dist/`. Per the repo's `CLAUDE.md`, `npm run check` alone is insufficient because it does not run PostCSS; the build is the real gate.

If the build fails, do not proceed. Read the error, fix, and rerun before going to Task 6.

---

### Task 6: Visual verification in the dev server

**Files:** none (manual check)

- [ ] **Step 1: Start the dev server in the background**

```bash
npm run dev
```

Expected: server starts on `http://localhost:4321/`.

- [ ] **Step 2: Open the site and confirm the desktop shell renders**

Visit `http://localhost:4321/` in a browser. The desktop shell should render as normal.

- [ ] **Step 3: Confirm all three new icons render on the desktop**

Locate the `about.me`, `incidents`, and `privacy` icons on the desktop. Each should render as a PNG (no emoji fallback). Expected appearance:
- `about.me` → shield/emblem with a gold compass-like center on a purple background
- `incidents` → yellow warning triangle with a magenta exclamation mark
- `privacy` → purple document-frame with a pink musical note and a pink/yellow key inside

Open browser devtools → Network tab and filter for `icons/vaporwave/`. Confirm there are no 404 responses for `crest.png`, `warning-triangle.png`, or `keyed-file.png`.

- [ ] **Step 4: Confirm they render on the mobile shell too**

Resize the browser to a narrow viewport (or use devtools mobile emulation). The mobile fallback shell should render tiles for each app; `about.me`, `incidents`, and `privacy` should each show their PNG on a cream tile background (matching how `resume`, `memes`, etc. already render).

- [ ] **Step 5: Confirm `vscode` is unchanged**

Still in the dev server, locate the `vscode` icon. It should still render with the `🆅` emoji glyph — no PNG. If it does not, something went wrong in Task 4 and needs fixing before committing.

- [ ] **Step 6: Stop the dev server**

Ctrl+C / kill the background process.

---

### Task 7: Commit

**Files:** all four from the earlier tasks

- [ ] **Step 1: Stage the changes**

```bash
git add public/images/icons/vaporwave/crest.png \
        public/images/icons/vaporwave/warning-triangle.png \
        public/images/icons/vaporwave/keyed-file.png \
        src/data/apps.ts
```

Explicit paths — not `git add -A` — to avoid pulling in unrelated files.

- [ ] **Step 2: Confirm staged contents are exactly these four files**

```bash
git status
```

Expected: four staged changes (three new PNGs, one modified `src/data/apps.ts`). Nothing else staged. Nothing unrelated in the unstaged section that might have drifted in.

- [ ] **Step 3: Create the commit**

```bash
git commit -m "$(cat <<'EOF'
feat: wire vaporwave icons onto about, incidents, privacy

Replaces the emoji-glyph fallback on three desktop apps with PNGs from
the Downloads vaporwave pack:

  about     → crest.png (shield/emblem, icon-22)
  incidents → warning-triangle.png (yellow triangle with !, icon-13)
  privacy   → keyed-file.png (document with key + music note, icon-12)

vscode remains on its emoji fallback pending a separate issue.

Spec: docs/superpowers/specs/2026-04-22-vaporwave-icon-assignments-design.md
EOF
)"
```

- [ ] **Step 4: Confirm the commit landed**

```bash
git log --oneline -1
git show --stat HEAD
```

Expected: one new commit on `main` (or the working branch), touching exactly four files: three new PNGs under `public/images/icons/vaporwave/` and one modified `src/data/apps.ts`.

- [ ] **Step 5: Do NOT push**

Per the repo's commit conventions, pushing / opening a PR is an explicit follow-up decision, not part of the implementation plan. Stop here and report back.
