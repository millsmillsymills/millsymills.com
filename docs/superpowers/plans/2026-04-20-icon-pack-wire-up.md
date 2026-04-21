# Desktop icon-pack wire-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace emoji glyphs on 10 of 11 desktop apps with PNG icons from the vaporwave + web1.0 packs. `about.me` intentionally keeps its emoji.

**Architecture:** Add an optional `iconUrl?: string` to `AppDef`. The two render sites — `DesktopIcon.astro` and the inline mobile-shell button in `MobileFallback.astro` — branch on it: `<img>` when present, otherwise the existing `<span>` glyph. Two new CSS rules carry icon styling for desktop and the cream-tile mobile context. No new components, no client JS.

**Tech Stack:** Astro 6 (static), TypeScript, plain CSS.

**Spec:** `docs/superpowers/specs/2026-04-20-icon-pack-wire-up-design.md`
**Issue:** [#80](https://github.com/millsmillsymills/millsymills.com/issues/80)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/apps.ts` | modify | Add `iconUrl?` to `AppDef`; populate on 10 apps |
| `src/components/desktop/DesktopIcon.astro` | modify | Accept `iconUrl?`, conditional `<img>` vs `<span>` |
| `src/components/desktop/Desktop.astro` | modify | Pass `iconUrl={a.iconUrl}` into `<DesktopIcon>` |
| `src/components/desktop/MobileFallback.astro` | modify | Same conditional, inline at the existing icon button |
| `src/styles/desktop.css` | modify | Two new rules: `.desktop-icon__icon`, `.mshell-icon__icon` |

No new files. No deleted files. No tests added (no runtime logic).

---

## Task 0: Pre-flight — confirm icon assets exist

This branch (`feat/icon-pack-wire-up`) was cut from `main` before PR #78 merged. The wire-up requires the icon files to exist on disk so the dev-server smoke test in Task 5 passes. Reconcile before starting.

**Files:** none modified.

- [ ] **Step 1: Check whether the icon directories exist**

Run:
```bash
ls public/images/icons/vaporwave/ public/images/icons/web10/ 2>/dev/null | head -5
```

Expected: 20 PNG filenames listed across the two directories.

- [ ] **Step 2: If empty/missing, rebase onto the asset source**

If the previous step returned nothing:
- If PR #78 has merged: `git fetch origin && git rebase origin/main`
- If PR #78 has NOT merged: `git rebase origin/content/photos-and-icon-packs` (then re-rebase onto main once #78 lands)

After rebase, re-run Step 1 — it must list the 20 PNGs before continuing.

- [ ] **Step 3: Sanity-check three icons we'll wire**

```bash
ls -1 public/images/icons/vaporwave/floppy-disk.png \
      public/images/icons/web10/under-construction-1.png \
      public/images/icons/vaporwave/dixie-cup.png
```

Expected: all three paths printed (exit 0). If any path errors, stop — the mapping in Task 1 references files that aren't on disk.

---

## Task 1: Add `iconUrl` to `AppDef` and populate the mapping

**Files:**
- Modify: `src/data/apps.ts`

- [ ] **Step 1: Add `iconUrl?` to the `AppDef` interface**

Open `src/data/apps.ts`. Find the `AppDef` interface (lines 4-18). Add one new field after `glyph`:

```ts
export interface AppDef {
	id: string;
	label: string;
	glyph: string;
	/** Path under public/ to a PNG icon. When set, replaces glyph in the UI. */
	iconUrl?: string;
	title: string;
	/** Hint copy for the per-app OG description. Keep under ~150 chars. */
	ogDescription: string;
	/** Default window geometry on desktop. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** If true, skip from the mobile shell (desktop-only apps). */
	desktopOnly?: boolean;
}
```

- [ ] **Step 2: Populate `iconUrl` on the 10 mapped apps**

For each app in the `apps` array, add an `iconUrl` line. Insert it directly after `glyph`. The complete list of edits:

| App | Line in array | Add |
|---|---|---|
| `about` | line ~24 | (no change — stays on emoji) |
| `resume` | line ~35 | `iconUrl: '/images/icons/vaporwave/floppy-disk.png',` |
| `photos` | line ~46 | `iconUrl: '/images/icons/web10/broken-image-netscape.png',` |
| `terminal` | line ~57 | `iconUrl: '/images/icons/web10/windows-95-internet.png',` |
| `flags` | line ~68 | `iconUrl: '/images/icons/vaporwave/arcade-game.png',` |
| `projects` | line ~79 | `iconUrl: '/images/icons/web10/under-construction-1.png',` |
| `uses` | line ~90 | `iconUrl: '/images/icons/web10/dial-up-days.png',` |
| `music` | line ~101 | `iconUrl: '/images/icons/vaporwave/casette-tape.png',` |
| `memes` | line ~112 | `iconUrl: '/images/icons/vaporwave/japanese-wave.png',` |
| `mail` | line ~123 | `iconUrl: '/images/icons/web10/netscape-floppy.png',` |
| `trash` | line ~134 | `iconUrl: '/images/icons/vaporwave/dixie-cup.png',` |

Example of one entry after edit (the `resume` app):

```ts
{
	id: 'resume',
	label: 'resume',
	glyph: '📄',
	iconUrl: '/images/icons/vaporwave/floppy-disk.png',
	title: 'resume.txt',
	ogDescription: 'mills\' resume — IAM, endpoint, automation, compliance. 10+ years across Trail of Bits, Leviathan, RealSelf, Commonwealth.',
	x: 200,
	y: 120,
	width: 680,
	height: 520,
},
```

- [ ] **Step 3: Run astro check**

```bash
npx astro check
```

Expected: `0 errors`, `0 warnings`, `0 hints`.

- [ ] **Step 4: Verify all 10 paths point at files that exist**

```bash
for p in $(grep -oE "/images/icons/[a-z0-9_/-]+\.png" src/data/apps.ts); do
  test -f "public$p" && echo "OK $p" || echo "MISSING $p"
done
```

Expected: 10 `OK` lines, 0 `MISSING`. Any `MISSING` line means a typo in Step 2 — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/data/apps.ts
git commit -m "feat(apps): add iconUrl field + map 10 apps to icon-pack PNGs (#80)"
```

---

## Task 2: Update `DesktopIcon.astro` and `Desktop.astro`

**Files:**
- Modify: `src/components/desktop/DesktopIcon.astro`
- Modify: `src/components/desktop/Desktop.astro`

- [ ] **Step 1: Replace `DesktopIcon.astro` with the conditional render**

Full new contents of `src/components/desktop/DesktopIcon.astro`:

```astro
---
interface Props {
	target: string;
	label: string;
	glyph: string;
	iconUrl?: string;
}

const { target, label, glyph, iconUrl } = Astro.props;
---

<li>
	<button type="button" class="desktop-icon" data-open-window={target}>
		{
			iconUrl ? (
				<img class="desktop-icon__icon" src={iconUrl} alt="" aria-hidden="true" />
			) : (
				<span class="desktop-icon__glyph" aria-hidden="true">{glyph}</span>
			)
		}
		<span class="desktop-icon__label">{label}</span>
	</button>
</li>
```

- [ ] **Step 2: Pass `iconUrl` through in `Desktop.astro`**

Open `src/components/desktop/Desktop.astro`. Find the icon mapping (line 50):

```astro
{apps.map((a) => <DesktopIcon target={a.id} label={a.label} glyph={a.glyph} />)}
```

Replace with:

```astro
{apps.map((a) => <DesktopIcon target={a.id} label={a.label} glyph={a.glyph} iconUrl={a.iconUrl} />)}
```

- [ ] **Step 3: Run astro check**

```bash
npx astro check
```

Expected: `0 errors`, `0 warnings`, `0 hints`.

- [ ] **Step 4: Commit**

```bash
git add src/components/desktop/DesktopIcon.astro src/components/desktop/Desktop.astro
git commit -m "feat(desktop): render iconUrl image when present, fall back to glyph (#80)"
```

---

## Task 3: Update `MobileFallback.astro`

**Files:**
- Modify: `src/components/desktop/MobileFallback.astro`

- [ ] **Step 1: Replace the icon button's glyph span with the conditional**

Open `src/components/desktop/MobileFallback.astro`. Find lines 66-68 (inside the `apps.map` mobile button):

```astro
<span class="mshell-icon__glyph" aria-hidden="true">
	{a.glyph}
</span>
```

Replace with:

```astro
{
	a.iconUrl ? (
		<img class="mshell-icon__icon" src={a.iconUrl} alt="" aria-hidden="true" />
	) : (
		<span class="mshell-icon__glyph" aria-hidden="true">{a.glyph}</span>
	)
}
```

The full surrounding `<li>` block should now read:

```astro
<li>
	<button
		type="button"
		class="mshell-icon"
		data-open-app={a.id}
		data-title={a.title}
	>
		{
			a.iconUrl ? (
				<img class="mshell-icon__icon" src={a.iconUrl} alt="" aria-hidden="true" />
			) : (
				<span class="mshell-icon__glyph" aria-hidden="true">{a.glyph}</span>
			)
		}
		<span class="mshell-icon__label">{a.label}</span>
	</button>
</li>
```

- [ ] **Step 2: Run astro check**

```bash
npx astro check
```

Expected: `0 errors`, `0 warnings`, `0 hints`.

- [ ] **Step 3: Commit**

```bash
git add src/components/desktop/MobileFallback.astro
git commit -m "feat(mobile): render iconUrl image when present, fall back to glyph (#80)"
```

---

## Task 4: Add CSS rules

**Files:**
- Modify: `src/styles/desktop.css`

- [ ] **Step 1: Add the desktop icon rule**

Open `src/styles/desktop.css`. Find `.desktop-icon__glyph` (around line 158):

```css
.desktop-icon__glyph {
	font-size: 40px;
	line-height: 1;
	filter: drop-shadow(2px 2px 0 var(--border));
}
```

Insert this new rule directly after it:

```css
.desktop-icon__icon {
	width: 48px;
	height: 48px;
	object-fit: contain;
	filter: drop-shadow(2px 2px 0 var(--border));
}
```

- [ ] **Step 2: Add the mobile icon rule**

Find `.mshell-icon__glyph` (around line 580):

```css
.mshell-icon__glyph {
	font-size: 36px;
	line-height: 1;
	width: 56px;
	height: 56px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--cream);
	border: 2px solid var(--border);
	border-radius: 14px;
	box-shadow: 2px 2px 0 0 var(--border);
}
```

Insert this new rule directly after it. The mobile icon must replicate the cream-tile chrome because it's replacing the `<span>` that *is* the tile (not a wrapper around it):

```css
.mshell-icon__icon {
	width: 56px;
	height: 56px;
	background: var(--cream);
	border: 2px solid var(--border);
	border-radius: 14px;
	box-shadow: 2px 2px 0 0 var(--border);
	object-fit: contain;
	padding: 6px;
}
```

- [ ] **Step 3: Verify the rules parse**

```bash
npx astro check
```

Expected: `0 errors`. (Astro check covers Astro files; CSS isn't separately validated, but a parse failure will surface during the dev server / build in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src/styles/desktop.css
git commit -m "style(desktop): icon image rules for desktop + mobile contexts (#80)"
```

---

## Task 5: Local verification

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

If not already running:

```bash
npm run dev
```

Wait for `Local http://localhost:4321/`.

- [ ] **Step 2: Visual smoke test in browser — desktop**

Open `http://localhost:4321/` in a browser at desktop width (≥1024px).

Verify:
- 10 desktop icons show PNG images (resume, photos, terminal, flags, projects, uses, music, memes, mail, trash).
- `about.me` icon still shows the 🪪 emoji.
- All icons display labels underneath.
- Hover state still works (dashed cream outline on hover).

- [ ] **Step 3: Visual smoke test in browser — mobile shell**

Resize the window narrower than ~768px (or open DevTools mobile mode).

Verify:
- 10 mobile icons show PNG images sitting inside their existing cream tile.
- `about.me` icon still shows the 🪪 emoji inside the cream tile.
- Tile chrome (border, shadow) is consistent between PNG icons and the emoji icon.

- [ ] **Step 4: Check dev-server log for 404s**

In the terminal running `npm run dev`, scroll the log. Confirm:
- No `[404] /images/icons/...` entries.
- 200 entries for the 10 wired icon paths if Astro logged them.

If a 404 appears, the path in `src/data/apps.ts` doesn't match a file on disk. Fix the path or rename the file.

- [ ] **Step 5: Production build**

```bash
SITE_URL=https://millsymills.com npm run build
```

Expected:
- Build completes with no errors.
- Output mentions copying public assets.

- [ ] **Step 6: Verify icons shipped to `dist/`**

```bash
find dist/images/icons -name '*.png' | wc -l
```

Expected: `20`. For an exact filename check on the three icons used in Task 1's spot-check:

```bash
ls dist/images/icons/vaporwave/floppy-disk.png \
   dist/images/icons/web10/under-construction-1.png \
   dist/images/icons/vaporwave/dixie-cup.png
```

Expected: all three paths printed, exit 0.

- [ ] **Step 7: Spot-check the rendered HTML**

```bash
grep -oE 'src="/images/icons/[^"]+"' dist/index.html | sort -u | head
```

Expected: 10 distinct `/images/icons/...` paths in the rendered home page (one per wired app).

- [ ] **Step 8: Stop the dev server (if you started it just for this task)**

If you launched a fresh dev server in Step 1, stop it now (Ctrl-C in that terminal). If it was already running, leave it.

---

## Task 6: Open PR

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/icon-pack-wire-up
```

- [ ] **Step 2: Open a PR referencing #80**

```bash
gh pr create --title "feat(desktop): wire icon-pack PNGs onto 10 of 11 apps (#80)" --body "$(cat <<'EOF'
## Summary
Replaces emoji glyphs on 10 desktop apps with PNG icons from the vaporwave + web1.0 packs landed in PR #78. \`about.me\` intentionally stays on its 🪪 emoji.

Closes #80.

## What changed
- \`src/data/apps.ts\` — added \`iconUrl?: string\` to \`AppDef\`; populated on 10 apps
- \`src/components/desktop/DesktopIcon.astro\` — conditional \`<img>\` vs \`<span>\` based on \`iconUrl\`
- \`src/components/desktop/Desktop.astro\` — pass \`iconUrl\` through
- \`src/components/desktop/MobileFallback.astro\` — same conditional, inline
- \`src/styles/desktop.css\` — two new rules: \`.desktop-icon__icon\` (48px, drop-shadow) and \`.mshell-icon__icon\` (56px, cream-tile chrome to match the \`__glyph\` span it replaces)

## Design + decisions
See \`docs/superpowers/specs/2026-04-20-icon-pack-wire-up-design.md\`.

## Out of scope
- The 5 reserved icons (cursor, hit-counter, midi-music, online, error-404) — tracked in #81.
- 2x / retina variants.
- Refactoring \`MobileFallback\` to consume \`DesktopIcon\`.

## Test plan
- [x] \`npx astro check\` clean (0/0/0)
- [x] Dev-server smoke: 10 PNG icons render desktop + mobile; about.me still on emoji
- [x] No \`/images/icons/*\` 404s in dev-server log
- [x] \`SITE_URL=https://millsymills.com npm run build\` succeeds
- [x] \`dist/images/icons/\` ships all 20 PNGs (10 wired to apps, 5 reserved for #81, 5 unused spares)
- [x] \`dist/index.html\` contains 10 distinct \`/images/icons/...\` src refs

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Confirm PR appears in the issue's linked-PRs section**

```bash
gh issue view 80 --json url,title,closedByPullRequestsReferences
```

Expected: the new PR appears in `closedByPullRequestsReferences`.

---

## Done

When all tasks above show `- [x]`:
- 10 desktop apps render with PNG icons; `about.me` keeps its emoji.
- Mobile shell shows the same icons inside the existing cream tiles.
- Build is green; dist ships the assets.
- PR is open against `main`, references #80.
