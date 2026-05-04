# Vaporwave Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the site's Y2K-pink XP chrome for a neon-noir vaporwave theme (dark navy/black + hot pink + cyan), wire a curated set of PNG assets from the `VAPORWAVE USER INTERFACE` pack, and give Terminal/Music/Memes/Photos bespoke per-app chrome. Delivered in three phased commits-groups (Foundations → Hero apps → Polish) per the spec.

**Architecture:** One-file CSS rebuild anchored on `src/styles/desktop.css`. Existing legacy CSS custom properties (`--pink-*`, `--lilac-*`, `--cream`, `--ink`, `--border`, `--titlebar-bg`, `--window-shadow`) are **repointed**, not renamed, so unrelated code keeps working. New tokens (`--bg-*`, `--ink-*`, `--neon-*`, motif layers) are added alongside. Three motif utility classes (`.motif-scanlines`, `.motif-grain`, `.motif-chrom`) provide opt-in texture that any surface can adopt. The four hero apps get their bespoke chrome in component-scoped `<style>` blocks; everything else re-themes via the shared tokens. All chrome text follows the "mills is always lowercase" branding rule (per user memory).

**Tech Stack:** Astro 6 (static), TypeScript, plain CSS. No unit test framework in this project — verification relies on `npm run check` (`astro check`), `npm run build`, and focused `npm run dev` manual browser smoke at phase gates.

**Spec:** `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md`

No tests added — the project has no JS test scaffolding, and this is a pure visual re-theme. Phase verification is dev-server manual smoke + build sanity.

---

## File map

| File | Action | Phase | Responsibility |
|---|---|---|---|
| `public/images/vaporwave-ui/ui-icons/{minimize,maximize,close}.png` | create | 1 | Window control raster icons |
| `public/images/noise.png` | create | 1 | 128×128 tileable grain for `.motif-grain` |
| `src/styles/desktop.css` | modify | 1 | Tokens, base chrome, motifs, ancillary, mobile, boot, accessibility |
| `src/components/desktop/Window.astro` | modify | 1 | Window controls — ASCII glyph → `<img>` children |
| `src/components/desktop/Desktop.astro` | modify | 1 | Add `<span class="desktop__sparkle-layer">` for second sparkle pass |
| `src/layouts/DesktopLayout.astro` | modify | 1 | Mount one `<div class="motif-grain">` overlay |
| `src/components/desktop/apps/{About,Projects,Resume,Uses,Flags,Mail,Trash}.astro` | modify | 1 | Audit inline `<style>` for hardcoded colors; swap to tokens |
| `CLAUDE.md` | modify | 1 | Add "Aesthetic conventions" section |
| `public/images/vaporwave-ui/buttons/{prev,play,pause,next,mute,unmute}.png` | create | 2 | Music transport buttons |
| `src/components/desktop/apps/Terminal.astro` | modify | 2 | CRT bezel wrapper + scanline/vignette + term color repoint |
| `src/components/desktop/apps/Music.astro` | modify | 2 | Cassette + reels + VU bars + raster transport buttons |
| `src/scripts/music.ts` | modify | 2 | `data-music-state` toggle + play/mute button image swap |
| `src/components/desktop/apps/Memes.astro` | modify | 2 | Polaroid structure + letterbox frame + zine header |
| `src/components/desktop/apps/Photos.astro` | modify | 2 | 35mm film strip + contact-sheet grid split |
| `public/images/desktop-background.jpg` | replace | 3 | New dark vaporwave wallpaper |
| (any stragglers) | modify | 3 | Final audit pass cleanup |

---

## Task 0: Pre-flight — verify source assets exist

The vaporwave asset pack lives at `~/Downloads/assets/VAPORWAVE USER INTERFACE/PNG/`. Before any code changes, confirm the exact source PNGs we'll copy exist with the expected dimensions — if the pack changed or moved, the plan's `cp` commands will fail and we catch it early.

**Files:** none modified.

- [ ] **Step 1: Verify the six source PNGs we depend on exist**

```bash
SRC="$HOME/Downloads/assets/VAPORWAVE USER INTERFACE/PNG"
for f in \
  "UI ICONS/WHITE/vaporwave ui_ui icon wht-02.png" \
  "UI ICONS/WHITE/vaporwave ui_ui icon wht-05.png" \
  "UI ICONS/WHITE/vaporwave ui_ui icon wht-10.png" \
  "BUTTONS/vaporwave ui_button-03.png" \
  "BUTTONS/vaporwave ui_button-07.png" \
  "BUTTONS/vaporwave ui_button-11.png"; do
  [ -f "$SRC/$f" ] && echo "OK  $f" || { echo "MISSING $f"; exit 1; }
done
```

Expected: 6 lines of `OK  ...`. If any line says `MISSING`, stop and re-verify the asset pack path — the spec assumes `~/Downloads/assets/VAPORWAVE USER INTERFACE/PNG/`.

- [ ] **Step 2: Verify current repo state is clean so we can commit per task**

```bash
git status --short
```

Expected: an empty working tree, OR only pre-existing unrelated changes that you're OK merging through this plan. If there are unrelated changes on your index that would ride along with any of the per-task commits, stash them first (`git stash push -m "pre-vaporwave-plan"`).

---

# Phase 1 — Foundations

The goal of Phase 1 is that `npm run dev` renders the **entire site** in the neon-noir palette with all base chrome re-themed, mobile re-themed, boot re-themed, and ancillary surfaces re-themed. Hero apps still have their old bodies inside the new window chrome (readable, just not yet bespoke).

---

## Task 1: Drop window-control + noise assets into `public/images/`

**Files:**
- Create: `public/images/vaporwave-ui/ui-icons/minimize.png`
- Create: `public/images/vaporwave-ui/ui-icons/maximize.png`
- Create: `public/images/vaporwave-ui/ui-icons/close.png`
- Create: `public/images/noise.png`

- [ ] **Step 1: Make the target directory**

```bash
mkdir -p public/images/vaporwave-ui/ui-icons
```

- [ ] **Step 2: Copy the three window-control icons from the pack**

```bash
SRC="$HOME/Downloads/assets/VAPORWAVE USER INTERFACE/PNG/UI ICONS/WHITE"
cp "$SRC/vaporwave ui_ui icon wht-02.png" public/images/vaporwave-ui/ui-icons/minimize.png
cp "$SRC/vaporwave ui_ui icon wht-05.png" public/images/vaporwave-ui/ui-icons/maximize.png
cp "$SRC/vaporwave ui_ui icon wht-10.png" public/images/vaporwave-ui/ui-icons/close.png
ls -l public/images/vaporwave-ui/ui-icons/
```

Expected: 3 files listed, each a few KB. If a file comes out 0 bytes, re-check the source path — spaces in it are correct (`"UI ICONS/WHITE"`).

- [ ] **Step 3: Generate the tileable noise PNG**

Run from the repo root — produces a 128×128 PNG of monochrome noise at ~2–4 KB. Requires `ffmpeg` (pre-installed on most macOS devboxes; `brew install ffmpeg` if missing). If `ffmpeg` isn't available, fall back to any pre-baked tileable grain PNG in that same size range.

```bash
ffmpeg -y -f lavfi -i "nullsrc=s=128x128:d=1,geq=random(1)*128,format=gray" \
  -frames:v 1 public/images/noise.png
ls -l public/images/noise.png
```

Expected: one file, `~2–5 KB`. Open it in Preview / an image viewer and verify it's noisy monochrome. If the file is > 30 KB, try adding `-pix_fmt gray` before `-frames:v 1`.

- [ ] **Step 4: Commit**

```bash
git add public/images/vaporwave-ui/ui-icons/ public/images/noise.png
git commit -m "feat(chrome): add vaporwave window-control icons + tileable noise grain"
```

---

## Task 2: Rebuild `:root` design tokens

Implements spec §1. The existing `:root` block in `src/styles/desktop.css` (lines ~31–69) defines the Y2K-pink token system. Replace the palette/chrome value half with the neon-noir palette; keep the font and cursor declarations unchanged. Legacy token **names** are kept — only values change — so call-sites across the codebase continue to work with the new hues.

**Files:**
- Modify: `src/styles/desktop.css` — `:root` block

- [ ] **Step 1: Replace the `:root` block's palette/chrome section**

Open `src/styles/desktop.css`. Find the `:root` block starting around line 31. Replace **only** the token declarations (palette, chrome, cursor section stays, font section stays). After the edit the block should read:

```css
:root {
	/* ============================================================
	 * Neon-noir vaporwave palette (#vaporwave chrome redesign)
	 * Surfaces darkest-first. Legacy --pink-*/--lilac-*/--cream
	 * names kept below for downstream compatibility — only their
	 * values moved into the new palette.
	 * ============================================================ */

	/* Surface hierarchy */
	--bg-void: #0a0320;
	--bg-deep: #140832;
	--bg-raised: #1e0f44;
	--bg-edge: #2a1654;

	/* Ink */
	--ink-primary: #f5edff;
	--ink-muted: #c8a8ff;
	--ink-dim: #8a6bb8;

	/* Accents */
	--neon-pink: #ff4fa8;
	--neon-pink-hi: #ff7ec0;
	--neon-pink-lo: #e62b8c;
	--neon-cyan: #00e5ff;
	--neon-cyan-hi: #66f0ff;
	--neon-cyan-lo: #00a8c2;
	--neon-lilac: #c8a8ff;

	/* Motif layers */
	--scanlines: repeating-linear-gradient(
		0deg,
		transparent 0 2px,
		rgba(0, 0, 0, 0.35) 2px 3px
	);
	--grain: url('/images/noise.png');

	/* Chrome geometry */
	--chrome-border-width: 2px;
	--chrome-radius-window: 10px;
	--chrome-radius-button: 4px;

	/* ------------------------------------------------------------
	 * Legacy names — repointed values, not renamed, so unrelated
	 * code that references --pink-*/--cream/etc keeps working.
	 * ------------------------------------------------------------ */
	--pink-50: #241055;
	--pink-100: #2a1654;
	--pink-200: #3b1d70;
	--pink-300: #ff7ec0;
	--pink-400: #ff4fa8;
	--pink-500: #e62b8c;
	--pink-600: #ff4fa8;

	--lilac-100: #2a1654;
	--lilac-300: #c8a8ff;

	--cream: #f5edff;
	--ink: #f5edff;
	--ink-soft: #c8a8ff;
	--border: #00e5ff;

	--titlebar-bg: linear-gradient(90deg, #ff4fa8 0%, #c8a8ff 50%, #00e5ff 100%);
	--titlebar-fg: #0a0320;
	--window-bg: #140832;
	--window-shadow: 4px 4px 0 0 var(--neon-cyan);

	/* Fonts — unchanged */
	--font-pixel: 'Press Start 2P', 'VT323', 'Courier New', monospace;
	--font-screen: 'VT323', 'Courier New', monospace;
	--font-mono: ui-monospace, 'SF Mono', 'Menlo', 'Monaco', monospace;
	--font-xp-ui: 'Tahoma', 'Geneva', system-ui, sans-serif;
	--font-xp-display: 'Franklin Gothic ITC', 'Georgia', serif;

	/* Cursors — unchanged */
	--c-default: url('/cursors/3dwarro.png') 0 0, default;
	--c-pointer: url('/cursors/default_link.png') 6 2, pointer;
	--c-text: url('/cursors/3dwbeam.png') 16 16, text;
	--c-grab: url('/cursors/3dwmove.png') 16 16, grab;
	--c-grabbing: url('/cursors/3dwmove.png') 16 16, grabbing;
	--c-not-allowed: url('/cursors/3dwno.png') 16 16, not-allowed;
}
```

- [ ] **Step 2: Also update `body { background: ... }` if it references `--pink-200`**

Around lines 100–106 in the same file, the body `background` is set to `var(--pink-200)`. The repoint makes that `#3b1d70` (dark purple), which is OK but the desktop's wallpaper layer sits above it anyway. Leave `body { background: var(--pink-200); }` as-is — no change. Just verify the repoint didn't accidentally delete it.

- [ ] **Step 3: Run typecheck to confirm the file still parses**

```bash
npm run check
```

Expected: no new errors. If astro-check complains about unrelated issues it already had, that's fine; the point is no *new* errors introduced by this edit.

- [ ] **Step 4: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): repoint CSS tokens to neon-noir vaporwave palette"
```

---

## Task 3: Add motif utility classes

Implements spec §3. Three opt-in utility classes live directly in `desktop.css` so any surface can pull them in. The grain overlay is applied via a single element mounted in the layout (Task 4) — the utility class here just provides the styling hook.

**Files:**
- Modify: `src/styles/desktop.css` — append a new section

- [ ] **Step 1: Append the motif block to `desktop.css`**

Add this block to `src/styles/desktop.css` after the `:root` block and before the `base reset` section. Keep the existing header comment structure:

```css
/* ------------------------------------------------------------------ */
/* motifs — opt-in texture utilities                                  */
/* ------------------------------------------------------------------ */

/* CRT scanline overlay. Apply to any positioned surface; adds a
 * fixed pseudo-element with horizontal stripes. Default is full
 * strength; the --soft variant dims to 25% for subtle chrome. */
.motif-scanlines {
	position: relative;
}
.motif-scanlines::after {
	content: '';
	position: absolute;
	inset: 0;
	background: var(--scanlines);
	pointer-events: none;
	z-index: 2;
}
.motif-scanlines--soft::after {
	opacity: 0.25;
}

/* Grain overlay element — mounted once in DesktopLayout, sits above
 * windows (z-index 9998) but below the taskbar (9999) so grain
 * textures all surfaces without fuzzing out chrome labels. */
.motif-grain {
	position: fixed;
	inset: 0;
	pointer-events: none;
	background-image: var(--grain);
	background-repeat: repeat;
	mix-blend-mode: overlay;
	opacity: 0.04;
	z-index: 9998;
}

/* Chromatic aberration on hover/focus. RGB-split text-shadow.
 * Opt-in per element — only fires on interaction to stay
 * non-intrusive for accessibility. */
.motif-chrom:hover,
.motif-chrom:focus-visible {
	text-shadow:
		-1.5px 0 0 var(--neon-pink),
		1.5px 0 0 var(--neon-cyan);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): add motif utility classes (scanlines, grain, chromatic)"
```

---

## Task 4: Mount grain overlay in `DesktopLayout`

**Files:**
- Modify: `src/layouts/DesktopLayout.astro` — add one `<div>` inside `<body>`

- [ ] **Step 1: Add the grain mount element**

Open `src/layouts/DesktopLayout.astro`. Find the `<body>` opening (around line 91). Add the grain `<div>` as the first child of `<body>`, before the `<slot />`:

```astro
<body data-initial-open={initialOpen}>
	<!-- flag{html_comments_have_no_secrets} -->
	<div class="motif-grain" aria-hidden="true"></div>
	<slot />
	<Clippy />
	<div class="boot-overlay" aria-hidden="true"></div>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/DesktopLayout.astro
git commit -m "feat(chrome): mount grain overlay in desktop layout"
```

---

## Task 5: Repaint base window chrome

Implements spec §4 for `.window`, `.window__titlebar`, `.window-control`, `.window__body`, and the inner headings/links/code blocks. The selectors stay; only declarations change.

**Files:**
- Modify: `src/styles/desktop.css` — `/* windows */` section (currently around lines 222–387)

- [ ] **Step 1: Rewrite the window selectors**

Replace the window section (the block headed `/* windows */`) with the following. Leave the `.window[hidden]` and `.window--maximized` selectors unchanged — only the visual selectors are retuned.

```css
/* ------------------------------------------------------------------ */
/* windows                                                            */
/* ------------------------------------------------------------------ */

.window {
	position: absolute;
	display: flex;
	flex-direction: column;
	min-width: 280px;
	min-height: 180px;
	max-width: calc(100vw - 32px);
	max-height: calc(100vh - 96px);
	background: var(--window-bg);
	color: var(--ink-primary);
	border: var(--chrome-border-width) solid var(--neon-cyan);
	border-radius: var(--chrome-radius-window);
	box-shadow: var(--window-shadow);
	overflow: hidden;
}

.window[hidden] {
	display: none;
}

.window--maximized {
	top: 16px !important;
	left: 16px !important;
	width: calc(100vw - 32px) !important;
	height: calc(100vh - 80px) !important;
}

.window__titlebar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	background: var(--titlebar-bg);
	color: var(--titlebar-fg);
	font-family: var(--font-pixel);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.3px;
	text-transform: lowercase;
	cursor: var(--c-grab);
	user-select: none;
	border-bottom: 2px solid var(--bg-void);
}

.window__titlebar:active {
	cursor: var(--c-grabbing);
}

.window__title {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.window__controls {
	display: flex;
	gap: 4px;
}

.window-control {
	all: unset;
	cursor: var(--c-pointer);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	padding: 2px;
	background: var(--bg-void);
	color: var(--ink-primary);
	border: 2px solid var(--bg-void);
	border-radius: var(--chrome-radius-button);
	transition: background 80ms ease, transform 80ms ease;
}

.window-control__icon {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	image-rendering: auto;
}

.window-control:hover,
.window-control:focus-visible {
	background: var(--neon-pink);
	outline: 2px solid var(--neon-cyan);
	outline-offset: 1px;
}

.window-control:active {
	transform: translate(1px, 1px);
}

.window-control--close:hover {
	background: var(--neon-pink-lo);
}

.window__body {
	flex: 1;
	overflow: auto;
	padding: 16px 18px;
	font-family: var(--font-screen);
	font-size: 20px;
	color: var(--ink-primary);
	background: var(--bg-deep);
}

.window__body h1,
.window__body h2,
.window__body h3 {
	font-family: var(--font-pixel);
	font-weight: normal;
	color: var(--neon-pink);
	letter-spacing: 0.5px;
}

.window__body h1 {
	font-size: 18px;
	margin: 0 0 12px;
}

.window__body h2 {
	font-size: 14px;
	margin: 16px 0 8px;
}

.window__body h3 {
	font-size: 12px;
	margin: 12px 0 6px;
	color: var(--neon-lilac);
}

.window__body p {
	margin: 0 0 12px;
}

.window__body ul {
	padding-left: 1.2em;
	margin: 0 0 12px;
}

.window__body code,
.window__body pre {
	font-family: var(--font-mono);
	font-size: 14px;
	background: var(--bg-raised);
	border: 1px solid var(--neon-lilac);
	border-radius: 4px;
	color: var(--neon-cyan);
	padding: 1px 4px;
}

.window__body pre {
	padding: 12px;
	overflow-x: auto;
}

.window__body a {
	color: var(--neon-cyan);
	text-decoration: underline;
	text-underline-offset: 2px;
}

.window__body a:hover {
	color: var(--neon-pink);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): repaint base window chrome (neon-noir palette)"
```

---

## Task 6: Swap window-control button content to `<img>`

Replace the three hardcoded ASCII glyphs (`_`, `□`, `✕`) with `<img>` references to the PNG icons from Task 1. Aria-labels stay on the `<button>` so nothing changes for screen readers.

**Files:**
- Modify: `src/components/desktop/Window.astro`

- [ ] **Step 1: Replace the button children**

Open `src/components/desktop/Window.astro`. The `<div class="window__controls">` block currently contains three `<button>` elements with text content. Replace the children of each button with an `<img>`:

```astro
<div class="window__controls">
	<button type="button" class="window-control window-control--min" aria-label="minimize">
		<img
			class="window-control__icon"
			src="/images/vaporwave-ui/ui-icons/minimize.png"
			alt=""
			aria-hidden="true"
		/>
	</button>
	<button type="button" class="window-control window-control--max" aria-label="maximize">
		<img
			class="window-control__icon"
			src="/images/vaporwave-ui/ui-icons/maximize.png"
			alt=""
			aria-hidden="true"
		/>
	</button>
	<button type="button" class="window-control window-control--close" aria-label="close">
		<img
			class="window-control__icon"
			src="/images/vaporwave-ui/ui-icons/close.png"
			alt=""
			aria-hidden="true"
		/>
	</button>
</div>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/desktop/Window.astro
git commit -m "feat(chrome): replace ascii window controls with raster icons"
```

---

## Task 7: Repaint taskbar + start button + start menu

Implements spec §4 (taskbar, start menu). Selectors stay; declarations change.

**Files:**
- Modify: `src/styles/desktop.css` — `/* taskbar */` and `/* start menu */` sections (currently around lines 389–533)

- [ ] **Step 1: Rewrite the taskbar + start menu selectors**

Replace those two blocks with:

```css
/* ------------------------------------------------------------------ */
/* taskbar                                                            */
/* ------------------------------------------------------------------ */

.taskbar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	height: 44px;
	display: flex;
	align-items: stretch;
	padding: 4px;
	background: var(--bg-deep);
	border-top: 2px solid var(--neon-pink);
	box-shadow: 0 -2px 0 0 var(--neon-cyan) inset;
	font-family: var(--font-pixel);
	font-size: 11px;
	color: var(--ink-primary);
	text-transform: lowercase;
	z-index: 9999;
}

.taskbar__start {
	all: unset;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 0 14px;
	background: var(--bg-void);
	color: var(--neon-cyan);
	border: 2px solid var(--neon-pink);
	border-radius: 6px;
	cursor: var(--c-pointer);
	letter-spacing: 0.5px;
}

.taskbar__start > span[aria-hidden='true'] {
	filter: drop-shadow(1px 1px 0 var(--neon-pink));
}

.taskbar__start:hover,
.taskbar__start:focus-visible {
	background: var(--neon-pink);
	color: var(--bg-void);
	outline: 2px solid var(--neon-cyan);
	outline-offset: 1px;
}

.taskbar__items {
	flex: 1;
	display: flex;
	gap: 4px;
	margin: 0 8px;
	padding: 0;
	list-style: none;
	overflow: hidden;
}

.taskbar-item {
	all: unset;
	cursor: var(--c-pointer);
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 0 12px;
	background: var(--bg-raised);
	color: var(--ink-primary);
	border: 2px solid var(--neon-pink);
	border-radius: 4px;
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.taskbar-item--active {
	background: var(--bg-void);
	border-color: var(--neon-cyan);
	color: var(--neon-cyan);
}

.taskbar-item:hover,
.taskbar-item:focus-visible {
	outline: 2px solid var(--neon-cyan);
	outline-offset: 1px;
}

.taskbar__clock {
	display: inline-flex;
	align-items: center;
	padding: 0 14px;
	background: var(--bg-void);
	color: var(--neon-cyan);
	border: 2px solid var(--neon-pink);
	border-radius: 6px;
	font-variant-numeric: tabular-nums;
	letter-spacing: 0.5px;
}

/* ------------------------------------------------------------------ */
/* start menu                                                         */
/* ------------------------------------------------------------------ */

.start-menu {
	position: fixed;
	left: 4px;
	bottom: 48px;
	width: 260px; /* sized to fit `mills@millsymills:~$` — see #305 / #308 */
	background: var(--bg-deep);
	border: 2px solid var(--neon-cyan);
	border-radius: 8px;
	box-shadow: var(--window-shadow);
	font-family: var(--font-pixel);
	font-size: 11px;
	color: var(--ink-primary);
	z-index: 10000;
	overflow: hidden;
}

.start-menu[hidden] {
	display: none;
}

.start-menu__header {
	padding: 10px 14px;
	background: var(--bg-void);
	color: var(--neon-pink);
	text-shadow: 0 1px 0 var(--neon-cyan); /* vertical-only — see #305 / #308 */
	letter-spacing: 0.5px;
}

.start-menu__list {
	margin: 0;
	padding: 6px 0;
	list-style: none;
}

.start-menu__item {
	all: unset;
	display: block;
	width: 100%;
	padding: 8px 14px;
	cursor: var(--c-pointer);
	color: var(--ink-primary);
	font-family: var(--font-pixel);
	font-size: 11px;
	letter-spacing: 0.5px;
}

.start-menu__item:hover,
.start-menu__item:focus-visible {
	background: var(--bg-raised);
	color: var(--neon-cyan);
	outline: none;
}

.start-menu__item--danger {
	color: var(--neon-pink-hi);
}

.start-menu__item--danger:hover,
.start-menu__item--danger:focus-visible {
	background: rgba(255, 51, 51, 0.18);
	color: var(--neon-pink-hi);
}

.start-menu__sep {
	height: 1px;
	margin: 4px 10px;
	background: var(--bg-edge);
	list-style: none;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): repaint taskbar + start menu"
```

---

## Task 8: Repaint desktop surface + add second sparkle layer

Implements spec §4 (desktop surface, desktop icons, sparkle layer). Existing single sparkle pair becomes two layers — the original stays on `.desktop::before/::after`, and a new `.desktop__sparkle-layer` element carries the pink counter-rotating pair.

**Files:**
- Modify: `src/styles/desktop.css` — `/* desktop surface */` and `/* desktop icons */` sections
- Modify: `src/components/desktop/Desktop.astro` — add one `<span>`

- [ ] **Step 1: Add the sparkle layer element in Desktop.astro**

Open `src/components/desktop/Desktop.astro`. Inside `<main class="desktop" id="desktop">`, add `<span class="desktop__sparkle-layer" aria-hidden="true"></span>` as the first child — before `<ul class="desktop__icons">`:

```astro
<main class="desktop" id="desktop">
	<span class="desktop__sparkle-layer" aria-hidden="true"></span>
	<ul class="desktop__icons">
		{apps.map((a) => <DesktopIcon target={a.id} label={a.label} glyph={a.glyph} iconUrl={a.iconUrl} />)}
	</ul>
```

- [ ] **Step 2: Rewrite the desktop surface + icons CSS**

Replace the existing `/* desktop surface */` and `/* desktop icons */` sections in `src/styles/desktop.css`:

```css
/* ------------------------------------------------------------------ */
/* desktop surface                                                    */
/* ------------------------------------------------------------------ */

.desktop {
	position: fixed;
	inset: 0;
	display: block;
	overflow: hidden;
	background-color: var(--bg-void);
	background-image: url('/images/desktop-background.jpg');
	background-size: cover;
	background-position: center;
}

/* Primary sparkle pair — cyan, original layout. */
.desktop::before,
.desktop::after {
	content: '✦   ✧   ⋆   ✦   ✧   ⋆   ✦   ✧';
	position: absolute;
	color: rgba(0, 229, 255, 0.55);
	font-family: var(--font-screen);
	font-size: 28px;
	letter-spacing: 4px;
	pointer-events: none;
	user-select: none;
}

.desktop::before {
	top: 12%;
	left: 8%;
	transform: rotate(-8deg);
	animation: twinkle 4s ease-in-out infinite alternate;
}

.desktop::after {
	bottom: 18%;
	right: 6%;
	transform: rotate(7deg);
	animation: twinkle 4s ease-in-out 1s infinite alternate;
}

/* Secondary sparkle layer — pink, counter-rotated, offset. */
.desktop__sparkle-layer {
	position: absolute;
	inset: 0;
	pointer-events: none;
	user-select: none;
}

.desktop__sparkle-layer::before,
.desktop__sparkle-layer::after {
	content: '⋆ ✧ ✦ ⋆ ✧ ✦ ⋆ ✧';
	position: absolute;
	color: rgba(255, 79, 168, 0.4);
	font-family: var(--font-screen);
	font-size: 22px;
	letter-spacing: 6px;
}

.desktop__sparkle-layer::before {
	top: 30%;
	right: 10%;
	transform: rotate(14deg);
	animation: twinkle 5s ease-in-out 0.5s infinite alternate;
}

.desktop__sparkle-layer::after {
	bottom: 34%;
	left: 12%;
	transform: rotate(-11deg);
	animation: twinkle 5s ease-in-out 2s infinite alternate;
}

@keyframes twinkle {
	from { opacity: 1; }
	to   { opacity: 0.35; }
}

/* ------------------------------------------------------------------ */
/* desktop icons                                                      */
/* ------------------------------------------------------------------ */

.desktop__icons {
	position: absolute;
	top: 24px;
	left: 24px;
	display: grid;
	grid-template-columns: repeat(2, 120px);
	gap: 16px 12px;
	margin: 0;
	padding: 0;
	list-style: none;
	z-index: 1;
}

.desktop-icon {
	all: unset;
	cursor: var(--c-pointer);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 8px 4px;
	border-radius: 6px;
	color: var(--neon-cyan);
	text-align: center;
	font-family: var(--font-screen);
	font-size: 18px;
	text-shadow: 1px 1px 0 var(--bg-void), 0 0 4px var(--neon-pink);
	transition: background 100ms ease;
}

.desktop-icon:hover,
.desktop-icon:focus-visible {
	background: rgba(255, 255, 255, 0.18);
	outline: 2px dashed var(--neon-cyan);
	outline-offset: -4px;
}

.desktop-icon__glyph {
	font-size: 56px;
	line-height: 1;
	filter: drop-shadow(2px 2px 0 var(--bg-void));
}

.desktop-icon__icon {
	width: 72px;
	height: 72px;
	object-fit: contain;
	filter: drop-shadow(2px 2px 0 var(--bg-void));
}

.desktop-icon__label {
	display: inline-block;
	max-width: 116px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/desktop.css src/components/desktop/Desktop.astro
git commit -m "feat(chrome): repaint desktop surface + add counter-rotating sparkle layer"
```

---

## Task 9: Repaint mobile shell

Implements spec §7. The mobile shell lives inside the `@media (max-width: 768px)` block at the bottom of `desktop.css`. Replace the mobile-specific overrides to use the new tokens and remove the pink-diagonal-stripe fallback (swap to a dark vertical gradient).

**Files:**
- Modify: `src/styles/desktop.css` — the `/* mobile shell */` section and the `@media (max-width: 768px)` block

- [ ] **Step 1: Rewrite mobile shell selectors**

Find the `/* mobile shell — phone-OS metaphor */` section (around line 535). Update the body colors and icon palette. The full mobile-shell CSS block should end up as:

```css
/* ------------------------------------------------------------------ */
/* mobile shell — phone-OS metaphor                                   */
/* ------------------------------------------------------------------ */

.mshell {
	display: none; /* hidden on desktop */
}

.mshell__statusbar {
	position: sticky;
	top: 0;
	z-index: 5;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 14px;
	background: var(--bg-deep);
	color: var(--neon-cyan);
	border-bottom: 2px solid var(--neon-pink);
	font-family: var(--font-pixel);
	font-size: 10px;
	letter-spacing: 0.5px;
	text-transform: lowercase;
	min-height: 28px;
	padding-top: max(6px, env(safe-area-inset-top));
}

.mshell__sparkles {
	letter-spacing: 4px;
	color: var(--neon-cyan);
}

.mshell__clock {
	font-variant-numeric: tabular-nums;
}

.mshell__home {
	padding: 24px 16px max(24px, env(safe-area-inset-bottom));
	min-height: calc(100vh - 36px);
}

.mshell__home-hero {
	margin: 8px 4px 24px;
	color: var(--ink-primary);
	font-family: var(--font-pixel);
}

.mshell__home-hero h1 {
	margin: 0 0 6px;
	font-size: 26px;
	text-shadow: 2px 2px 0 var(--neon-pink);
	letter-spacing: 1px;
	text-transform: lowercase;
}

.mshell__home-hero p {
	margin: 0;
	font-family: var(--font-screen);
	font-size: 17px;
	color: var(--ink-muted);
}

.mshell__grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 16px 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

@media (max-width: 360px) {
	.mshell__grid {
		grid-template-columns: repeat(3, 1fr);
	}
}

.mshell-icon {
	all: unset;
	cursor: var(--c-pointer);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 6px 2px;
	border-radius: 12px;
	color: var(--neon-cyan);
	text-align: center;
	font-family: var(--font-pixel);
	font-size: 9px;
	letter-spacing: 0.5px;
	text-shadow: 1px 1px 0 var(--bg-void);
}

.mshell-icon:active {
	background: rgba(255, 79, 168, 0.18);
	transform: scale(0.96);
}

.mshell-icon__glyph {
	font-size: 36px;
	line-height: 1;
	width: 56px;
	height: 56px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--bg-raised);
	border: 2px solid var(--neon-cyan);
	border-radius: 14px;
	box-shadow: 2px 2px 0 0 var(--neon-pink);
}

.mshell-icon__icon {
	width: 56px;
	height: 56px;
	background: var(--bg-raised);
	border: 2px solid var(--neon-cyan);
	border-radius: 14px;
	box-shadow: 2px 2px 0 0 var(--neon-pink);
	object-fit: contain;
	padding: 6px;
}

.mshell-icon__label {
	display: inline-block;
	max-width: 80px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mshell__app-view[hidden] {
	display: none;
}

.mshell__app-chrome {
	position: sticky;
	top: 28px;
	z-index: 4;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	background: var(--bg-deep);
	color: var(--ink-primary);
	border-bottom: 2px solid var(--neon-pink);
	font-family: var(--font-pixel);
	font-size: 11px;
	letter-spacing: 0.5px;
	text-transform: lowercase;
}

.mshell__chrome-back {
	all: unset;
	cursor: var(--c-pointer);
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: var(--bg-raised);
	color: var(--neon-cyan);
	border: 2px solid var(--neon-cyan);
	border-radius: 6px;
	font-family: var(--font-pixel);
	font-size: 10px;
}

.mshell__chrome-back:active {
	transform: translate(1px, 1px);
}

.mshell__chrome-title {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mshell__app-body {
	padding: 18px 18px max(24px, env(safe-area-inset-bottom));
	background: var(--bg-deep);
	color: var(--ink-primary);
	min-height: calc(100vh - 80px);
	font-family: var(--font-screen);
	font-size: 18px;
}

.mshell__app-body h1 {
	font-family: var(--font-pixel);
	font-size: 18px;
	color: var(--neon-pink);
	margin: 0 0 12px;
}

.mshell__app-body h2 {
	font-family: var(--font-pixel);
	font-size: 13px;
	color: var(--neon-cyan);
	margin: 16px 0 8px;
}

.mshell__app-body h3 {
	font-family: var(--font-pixel);
	font-size: 11px;
	color: var(--neon-lilac);
	margin: 12px 0 6px;
}

.mshell__app-body code,
.mshell__app-body pre {
	font-family: var(--font-mono);
	font-size: 14px;
	background: var(--bg-raised);
	border: 1px solid var(--neon-lilac);
	border-radius: 4px;
	color: var(--neon-cyan);
	padding: 1px 4px;
}

.mshell__app-body a {
	color: var(--neon-cyan);
	text-decoration: underline;
}

[data-mobile-app][hidden] {
	display: none;
}

body.mshell-app-open {
	background: var(--bg-deep);
}
```

- [ ] **Step 2: Replace the `@media (max-width: 768px)` html/body override**

At the bottom of `desktop.css` (around line 893), there's a media-query block that sets pink diagonal-stripe fallback on html/body. Replace the whole `@media (max-width: 768px) { html, body { ... } }` block with a dark vertical-gradient fallback:

```css
@media (max-width: 768px) {
	html,
	body {
		overflow: auto;
		background: var(--bg-void);
		background-image: linear-gradient(180deg, var(--bg-void) 0%, var(--bg-deep) 100%);
	}
}
```

Only replace the existing html/body block — leave any other declarations inside that media query (if present) in place.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): repaint mobile shell (neon-noir)"
```

---

## Task 10: Repaint boot overlay

Implements spec §6 (boot overlay). The existing CRT boot animation stays — only text color and scanline intensity change.

**Files:**
- Modify: `src/styles/desktop.css` — `/* boot overlay */` section (around lines 800–891)

- [ ] **Step 1: Update the boot overlay text color and scanline overlay**

Find the `.boot-overlay--on::before` rule (the text element) and the `.boot-overlay--on::after` rule (the scanline overlay). Update their declarations:

```css
.boot-overlay--on::before {
	content: 'mills.exe';
	font-family: var(--font-pixel);
	font-size: 18px;
	color: var(--neon-cyan);
	letter-spacing: 2px;
	text-shadow: 0 0 8px var(--neon-pink), 0 0 16px var(--neon-cyan);
	opacity: 0;
	animation: boot-text 1.4s ease-out forwards;
}

.boot-overlay--on::after {
	content: '';
	position: absolute;
	inset: 0;
	background: repeating-linear-gradient(
		0deg,
		rgba(0, 229, 255, 0.08) 0 1px,
		transparent 1px 3px
	);
	pointer-events: none;
}
```

Leave `@keyframes boot-crt` and `@keyframes boot-text` unchanged. Leave the `@media (prefers-reduced-motion: reduce)` branch unchanged (it hides the overlay — correct under reduced motion).

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): repaint boot overlay (neon-cyan text, cyan scanlines)"
```

---

## Task 11: Repaint ancillary surfaces (command palette, help, clippy, reset, flag toasts)

Implements spec §6. Each of these has its CSS in `desktop.css` (command palette, help overlay, flag toasts, reset confirm) or in a scoped component `<style>` block (Clippy). Clippy's CSS already references `var(--cream)` / `var(--border)` — those are repointed by Task 2, so Clippy is largely "done" after Task 2; this task adds just the box-shadow tweak for its bubble/popover. The others need selector-by-selector repaint.

**Files:**
- Modify: `src/styles/desktop.css` — `/* flag capture toasts */`, `/* command palette */`, `/* help overlay */`, `/* reset confirm */` sections
- Modify: `src/components/desktop/Clippy.astro` — bubble/popover shadow color

- [ ] **Step 1: Repaint flag toasts**

Replace the `.flag-toast` and `.flag-toast--in` rules (around lines 779–797):

```css
.flag-toast {
	padding: 10px 14px;
	background: var(--bg-deep);
	color: var(--ink-primary);
	border: 2px solid var(--neon-cyan);
	border-left: 6px solid var(--neon-pink);
	border-radius: 6px;
	box-shadow: var(--window-shadow);
	font-family: var(--font-pixel);
	font-size: 11px;
	max-width: 280px;
	transform: translateX(120%);
	transition: transform 220ms ease;
	pointer-events: auto;
}

.flag-toast.flag-toast--in {
	transform: translateX(0);
}
```

- [ ] **Step 2: Repaint command palette**

The `.cmdp*` rules start around line 921. Leave `.cmdp` (the outer positioner) and `.cmdp[hidden]` untouched. Replace only the visual rules:

```css
.cmdp__panel {
	width: min(520px, calc(100vw - 32px));
	max-height: 70vh;
	display: flex;
	flex-direction: column;
	background: var(--bg-deep);
	color: var(--ink-primary);
	border: 2px solid var(--neon-cyan);
	border-radius: 10px;
	box-shadow: var(--window-shadow);
	overflow: hidden;
}

.cmdp__header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	background: var(--bg-void);
	border-bottom: 2px solid var(--neon-pink);
}

.cmdp__prompt {
	font-family: var(--font-pixel);
	font-size: 14px;
	color: var(--neon-pink);
}

.cmdp__input {
	flex: 1;
	all: unset;
	font-family: var(--font-screen);
	font-size: 18px;
	color: var(--ink-primary);
	background: transparent;
}

.cmdp__input::placeholder {
	color: var(--ink-dim);
}

.cmdp__kbd {
	font-family: var(--font-pixel);
	font-size: 9px;
	padding: 3px 6px;
	background: var(--bg-void);
	color: var(--neon-cyan);
	border: 1px solid var(--neon-cyan);
	border-radius: 4px;
}

.cmdp__list {
	flex: 1;
	overflow: auto;
	margin: 0;
	padding: 4px 0;
	list-style: none;
}

.cmdp__item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	cursor: var(--c-pointer);
	color: var(--ink-primary);
	border-left: 3px solid transparent;
}

.cmdp__item:hover {
	background: var(--bg-raised);
}

.cmdp__item--active {
	background: var(--bg-raised);
	color: var(--neon-cyan);
	border-left-color: var(--neon-cyan);
}

.cmdp__glyph {
	font-size: 20px;
	line-height: 1;
}

.cmdp__label {
	flex: 1;
	font-family: var(--font-screen);
	font-size: 16px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cmdp__hint {
	font-family: var(--font-pixel);
	font-size: 9px;
	color: var(--ink-dim);
}

.cmdp__empty {
	padding: 16px;
	text-align: center;
	font-family: var(--font-screen);
	font-size: 16px;
	color: var(--ink-dim);
}

.cmdp__footer {
	display: flex;
	justify-content: space-between;
	gap: 10px;
	padding: 8px 12px;
	background: var(--bg-void);
	border-top: 2px solid var(--neon-pink);
	font-family: var(--font-pixel);
	font-size: 9px;
	color: var(--ink-muted);
}
```

Also change `.cmdp` itself (the outer positioner / backdrop):

```css
.cmdp {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 14vh;
	background: rgba(10, 3, 32, 0.85);
	z-index: 10002;
}
```

- [ ] **Step 3: Repaint help overlay**

The `.help*` rules start around line 1060. Apply the same modal pattern. Target state:

```css
.help {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 12vh;
	background: rgba(10, 3, 32, 0.85);
	z-index: 10002;
}

.help[hidden] {
	display: none;
}

.help__panel {
	width: min(560px, calc(100vw - 32px));
	max-height: 76vh;
	display: flex;
	flex-direction: column;
	background: var(--bg-deep);
	color: var(--ink-primary);
	border: 2px solid var(--neon-cyan);
	border-radius: 10px;
	box-shadow: var(--window-shadow);
	overflow: hidden;
}

.help__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	background: var(--bg-void);
	color: var(--neon-pink);
	font-family: var(--font-pixel);
	font-size: 11px;
	letter-spacing: 0.5px;
	border-bottom: 2px solid var(--neon-pink);
	text-transform: lowercase;
}

.help__close {
	all: unset;
	cursor: var(--c-pointer);
	padding: 2px 8px;
	background: var(--bg-raised);
	color: var(--neon-cyan);
	border: 1px solid var(--neon-cyan);
	border-radius: 4px;
	font-family: var(--font-pixel);
	font-size: 11px;
}

.help__close:active {
	transform: translate(1px, 1px);
}

.help__body {
	flex: 1;
	overflow: auto;
	padding: 14px 18px;
	font-family: var(--font-screen);
	font-size: 17px;
}

.help__body h3 {
	font-family: var(--font-pixel);
	font-size: 12px;
	color: var(--neon-pink);
	margin: 18px 0 8px;
	letter-spacing: 0.5px;
}

.help__body h3:first-of-type {
	margin-top: 0;
}

.help__body dl {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 6px 14px;
	margin: 0;
}

.help__body dt {
	display: inline-flex;
	gap: 3px;
	align-items: center;
}

.help__body dd {
	margin: 0;
	color: var(--ink-muted);
}

.help__body kbd {
	font-family: var(--font-pixel);
	font-size: 10px;
	padding: 2px 6px;
	background: var(--bg-void);
	color: var(--neon-cyan);
	border: 1px solid var(--neon-cyan);
	border-radius: 4px;
}

.help__body code {
	font-family: var(--font-mono);
	font-size: 14px;
	background: var(--bg-raised);
	border: 1px solid var(--neon-lilac);
	border-radius: 4px;
	color: var(--neon-cyan);
	padding: 1px 4px;
}

.help__note {
	margin-top: 16px;
	color: var(--ink-dim);
	font-size: 14px;
}
```

- [ ] **Step 4: Repaint reset-confirm**

The `.reset-confirm*` rules start around line 1228. Target state:

```css
.reset-confirm {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(10, 3, 32, 0.85);
	z-index: 10003;
}

.reset-confirm[hidden] {
	display: none;
}

.reset-confirm__panel {
	width: min(440px, calc(100vw - 32px));
	background: var(--bg-deep);
	color: var(--ink-primary);
	border: 2px solid var(--neon-cyan);
	border-radius: 10px;
	box-shadow: var(--window-shadow);
	overflow: hidden;
}

.reset-confirm__header {
	padding: 10px 14px;
	background: var(--bg-void);
	color: var(--neon-pink-hi);
	font-family: var(--font-pixel);
	font-size: 12px;
	border-bottom: 2px solid var(--neon-pink);
	letter-spacing: 0.5px;
	text-transform: lowercase;
}

.reset-confirm__body {
	padding: 14px 18px;
	font-family: var(--font-screen);
	font-size: 17px;
}

.reset-confirm__body ul {
	margin: 8px 0;
	padding-left: 1.2em;
	color: var(--ink-muted);
}

.reset-confirm__note {
	margin-top: 10px;
	color: var(--neon-pink-hi);
}

.reset-confirm__actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 10px 14px;
	background: var(--bg-void);
	border-top: 2px solid var(--neon-pink);
}

.reset-confirm__btn {
	all: unset;
	cursor: var(--c-pointer);
	padding: 6px 12px;
	font-family: var(--font-pixel);
	font-size: 11px;
	border: 2px solid var(--bg-void);
	border-radius: 4px;
}

.reset-confirm__btn--no {
	background: var(--bg-raised);
	color: var(--neon-cyan);
	border-color: var(--neon-cyan);
}

.reset-confirm__btn--no:hover,
.reset-confirm__btn--no:focus-visible {
	background: var(--neon-cyan);
	color: var(--bg-void);
	outline: none;
}

.reset-confirm__btn--yes {
	background: var(--neon-pink-lo);
	color: var(--ink-primary);
	border-color: #ff3333;
	box-shadow: 3px 3px 0 #ff3333;
}

.reset-confirm__btn--yes:hover,
.reset-confirm__btn--yes:focus-visible {
	background: #ff3333;
	color: var(--ink-primary);
	outline: none;
}
```

- [ ] **Step 5: Update Clippy bubble & popover shadows**

Open `src/components/desktop/Clippy.astro`. Inside the scoped `<style>` block, the `.clippy__bubble` and `.clippy__popover` shadows use `var(--border)` — repointed that's now cyan, so the primary shadow color is correct. Replace the existing `box-shadow` values with the chunky cyan-on-navy + pink offset pattern so Clippy matches windows:

Find `.clippy__bubble { ... box-shadow: 2px 2px 0 0 var(--border); ... }` and change to:

```css
.clippy__bubble {
	/* existing lines stay; only box-shadow/border change */
	background: var(--bg-deep);
	color: var(--ink-primary);
	border: 2px solid var(--neon-cyan);
	box-shadow: 4px 4px 0 0 var(--neon-pink);
}
```

Find `.clippy__popover { ... }` and give it the same treatment — background `var(--bg-deep)`, border `var(--neon-cyan)`, shadow `4px 4px 0 0 var(--neon-pink)`. Keep all the layout/positioning declarations untouched.

- [ ] **Step 6: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/styles/desktop.css src/components/desktop/Clippy.astro
git commit -m "feat(chrome): repaint command palette, help, clippy, reset, flag toasts"
```

---

## Task 12: Audit info-dense apps for hardcoded colors

Implements spec §6 app-audit. Seven app files (About, Projects, Resume, Uses, Flags, Mail, Trash) have inline `<style>` blocks that may reference hardcoded hex values or old token names. Grep each file and replace.

**Files:**
- Modify: `src/components/desktop/apps/About.astro`
- Modify: `src/components/desktop/apps/Projects.astro`
- Modify: `src/components/desktop/apps/Resume.astro`
- Modify: `src/components/desktop/apps/Uses.astro`
- Modify: `src/components/desktop/apps/Flags.astro`
- Modify: `src/components/desktop/apps/Mail.astro`
- Modify: `src/components/desktop/apps/Trash.astro`

- [ ] **Step 1: Find hardcoded color hexes across those files**

```bash
grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' \
  src/components/desktop/apps/{About,Projects,Resume,Uses,Flags,Mail,Trash}.astro
```

Note every match. Most will be fine (e.g., `rgba(0,0,0,0.2)` for overlays). The ones that matter are color values that reference the OLD pink palette — those need to become token references.

- [ ] **Step 2: For each matched hex, decide: keep or replace**

Use this mapping table. If the existing value signals "pink accent" → `var(--neon-pink)`; "lilac highlight" → `var(--neon-lilac)`; "cream background" → `var(--bg-deep)` or `var(--bg-raised)` depending on context; "dark outline" → `var(--neon-cyan)` (borders now read as cyan on dark); "body ink" → `var(--ink-primary)`.

Specifically update:
- Any `#ffaad7`, `#ff7ec0`, `#e62b8c`, `#ff4fa8` used for accent fills → `var(--neon-pink)` (or `--neon-pink-hi/-lo` variants)
- Any `#fff9f3`, `#fff0f7`, `#ffd6ec` used for surface backgrounds → `var(--bg-deep)` or `var(--bg-raised)`
- Any `#321a44`, `#1a0e23`, `#4a3257` used for text/ink → `var(--ink-primary)` or `var(--ink-muted)`
- Any `#c8a8ff`, `#efe1ff` used for highlight → `var(--neon-lilac)`

Edit each file in place. Keep the same selectors; only change color values.

- [ ] **Step 3: Re-grep to confirm no raw pink hexes remain where they shouldn't**

```bash
grep -nE '#(ffaad7|ff7ec0|e62b8c|ff4fa8|fff9f3|fff0f7|ffd6ec|321a44|1a0e23|4a3257|c8a8ff|efe1ff)' \
  src/components/desktop/apps/{About,Projects,Resume,Uses,Flags,Mail,Trash}.astro
```

Expected: empty output (no matches). Any remaining matches should be a deliberate keep — add a comment in the file explaining why.

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/desktop/apps/{About,Projects,Resume,Uses,Flags,Mail,Trash}.astro
git commit -m "refactor(apps): swap hardcoded chrome colors for vaporwave tokens"
```

---

## Task 13: Accessibility — reduced motion + prefers-contrast

Implements spec §10. Extend the existing `@media (prefers-reduced-motion: reduce)` block (currently only hides the boot overlay) to also disable sparkle twinkle and chromatic aberration. Add a new `@media (prefers-contrast: more)` block that flattens gradient/texture motifs.

**Files:**
- Modify: `src/styles/desktop.css` — extend existing reduced-motion block, add new prefers-contrast block

- [ ] **Step 1: Extend the reduced-motion block**

Find `@media (prefers-reduced-motion: reduce)` in `desktop.css` (around line 887). It currently contains only:

```css
@media (prefers-reduced-motion: reduce) {
	.boot-overlay {
		display: none !important;
	}
}
```

Replace it with:

```css
@media (prefers-reduced-motion: reduce) {
	.boot-overlay {
		display: none !important;
	}
	.desktop::before,
	.desktop::after,
	.desktop__sparkle-layer::before,
	.desktop__sparkle-layer::after {
		animation: none !important;
		opacity: 0.75;
	}
	.motif-chrom:hover,
	.motif-chrom:focus-visible {
		text-shadow: none !important;
	}
}
```

- [ ] **Step 2: Add a `prefers-contrast: more` block**

Append this block immediately after the reduced-motion block:

```css
@media (prefers-contrast: more) {
	:root {
		--titlebar-bg: var(--neon-pink);
	}
	.motif-grain {
		opacity: 0 !important;
	}
	.motif-scanlines::after,
	.motif-scanlines--soft::after {
		opacity: 0 !important;
	}
	.motif-chrom:hover,
	.motif-chrom:focus-visible {
		text-shadow: none !important;
	}
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/desktop.css
git commit -m "feat(chrome): respect prefers-reduced-motion and prefers-contrast"
```

---

## Task 14: Update `CLAUDE.md` with aesthetic conventions

Adds a short section documenting the neon-noir theme, the "mills lowercase" branding rule, and the vaporwave asset directory layout.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find a good insertion point**

Open `CLAUDE.md`. After the `## Stack` section and before `## Key commands`, insert a new section `## Aesthetic conventions`.

- [ ] **Step 2: Add the section**

Insert this block:

```markdown
## Aesthetic conventions

- **Theme:** neon-noir vaporwave — dark navy/black surfaces, hot pink + cyan accents, lilac/cream supporting. Tokens live in `src/styles/desktop.css :root` (`--bg-void`, `--bg-deep`, `--neon-pink`, `--neon-cyan`, etc.). Legacy `--pink-*` / `--cream` / `--border` names are repointed to new values, not renamed, so any code referencing them keeps working.
- **"mills" is always lowercase.** Branding rule — never "Mills", "MILLS", "MillsOS", "MILLS-OS". Applies to UI chrome text, window titles, code comments, docs. Existing chrome already honors this (`mills@millsymills:~$` in the start menu, lowercase app labels in `src/data/apps.ts`).
- **Asset directories:**
  - `public/images/vaporwave-ui/ui-icons/` — window controls (minimize, maximize, close)
  - `public/images/vaporwave-ui/buttons/` — Music transport buttons (prev, play, pause, next, mute, unmute)
  - `public/images/vaporwave-ui/misc/` — occasional decorative icons
  - `public/images/noise.png` — tileable grain for the `.motif-grain` overlay
- **Motif utilities** (`.motif-scanlines`, `.motif-grain`, `.motif-chrom`) are opt-in texture classes in `desktop.css`. Grain is mounted once via `<div class="motif-grain">` in `DesktopLayout.astro` so it paints above windows but below the taskbar.
- **Hero apps** (Terminal, Music, Memes, Photos) have bespoke scoped chrome in their component `<style>` blocks; info-dense apps (About, Projects, Resume, Uses, Flags, Mail, Trash) inherit the base window chrome unchanged.
- **Full spec:** `docs/superpowers/specs/2026-04-21-vaporwave-chrome-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add aesthetic conventions section (vaporwave theme, lowercase rule)"
```

---

## Task 15: Phase 1 verification gate

Run the full verification suite against the current working tree. This is the Phase 1 quality gate — if anything fails here, fix before starting Phase 2.

**Files:** none modified.

- [ ] **Step 1: Typecheck**

```bash
npm run check
```

Expected: 0 errors, 0 warnings. If warnings exist that predate this plan, that's fine — but no *new* warnings from Phase 1 work.

- [ ] **Step 2: Production build**

```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: build succeeds. Inspect `dist/` size — it should have grown by the asset budget (~20 KB for the 3 window-control PNGs + noise PNG). No unexpected file size blowups.

- [ ] **Step 3: Full CI-local**

```bash
./scripts/ci-local.sh
```

Expected: passes all stages (node + terraform).

- [ ] **Step 4: Dev server manual smoke — desktop viewport**

```bash
npm run dev
```

In a browser at `http://localhost:4321`, confirm:
- Desktop wallpaper visible; sparkle layers fading in/out (two colors — cyan and pink).
- Taskbar at bottom: dark deep-navy with pink top border + cyan inset highlight; start button with neon-cyan `★ start`.
- Click start — menu opens: dark panel with cyan border + pink shadow; header reads `mills@millsymills:~$` in neon-pink on dark; items hover to raised bg + cyan text; reset item pink-shifted.
- Click any app (e.g. About) — window opens: dark `--bg-deep` body with neon-pink headings and cyan links; titlebar shows the pink→lilac→cyan gradient in lowercase text; window controls now render as raster icons (not ASCII).
- Close the window (click the new raster close icon).
- `⌘K` / `Ctrl+K`: command palette opens — dark panel, pink prompt, cyan selected border.
- `?`: help overlay opens — dark panel, cyan kbd chips, pink section headings.
- Start menu → reset: confirm dialog appears — red-shifted confirm button.
- Clippy sprite animates normally (re-palette automatic via tokens).
- No console errors in devtools.

- [ ] **Step 5: Dev server manual smoke — mobile viewport**

In devtools responsive mode at 390px:
- Dark gradient backdrop (no pink diagonal stripes).
- Statusbar: dark deep-navy with pink bottom border; sparkles in cyan.
- Home grid tiles: raised-bg squares with cyan border + pink shadow.
- Tap any app: chrome bar re-themed; body is dark with readable neon headings.

- [ ] **Step 6: Reduced motion**

In macOS System Settings → Accessibility → Display → Reduce motion: ON. Reload the site. Confirm:
- Boot overlay skipped.
- Sparkle layers static (opacity fixed, no animation).
- No chromatic aberration on hover (text stays clean).

- [ ] **Step 7: Prefers contrast: more (via devtools)**

In Chrome devtools → Rendering → Emulate CSS media feature `prefers-contrast: more`. Confirm:
- Titlebar gradient collapses to flat neon-pink.
- Grain overlay invisible.
- Scanlines invisible (where applied).

- [ ] **Step 8: Commit the verification as a phase milestone**

If all checks pass, tag the commit chain:

```bash
git tag phase-1-foundations
```

(Tag is optional — it's a marker for "Phase 1 verified working." Skip if project convention doesn't use local tags.)

---

# Phase 2 — Hero apps

Terminal, Music, Memes, Photos each get bespoke chrome implemented in their component-scoped `<style>` blocks. The base chrome and window chassis from Phase 1 still apply (titlebar + window controls come from `Window.astro`); only the window body is transformed per app.

---

## Task 16: Drop music transport button assets

**Files:**
- Create: `public/images/vaporwave-ui/buttons/prev.png`
- Create: `public/images/vaporwave-ui/buttons/play.png`
- Create: `public/images/vaporwave-ui/buttons/pause.png`
- Create: `public/images/vaporwave-ui/buttons/next.png`
- Create: `public/images/vaporwave-ui/buttons/mute.png`
- Create: `public/images/vaporwave-ui/buttons/unmute.png`

- [ ] **Step 1: Make the target directory**

```bash
mkdir -p public/images/vaporwave-ui/buttons
```

- [ ] **Step 2: Copy the core three transport buttons (prev/play/next)**

```bash
SRC="$HOME/Downloads/assets/VAPORWAVE USER INTERFACE/PNG/BUTTONS"
cp "$SRC/vaporwave ui_button-03.png" public/images/vaporwave-ui/buttons/prev.png
cp "$SRC/vaporwave ui_button-07.png" public/images/vaporwave-ui/buttons/play.png
cp "$SRC/vaporwave ui_button-11.png" public/images/vaporwave-ui/buttons/next.png
```

- [ ] **Step 3: Pick + copy pause / mute / unmute**

The spec (§Open questions / §8) leaves exact pause/mute/unmute pairing as implementer's call. Pick three visually distinct buttons from the same pack — preferably with icon shapes that suggest pause (two bars), mute (speaker), and unmute (speaker with waves or X). Inspect the pack:

```bash
open "$HOME/Downloads/assets/VAPORWAVE USER INTERFACE/PNG/BUTTONS"
```

Pick three files, then copy with the target names. Example picks (substitute your own if better ones appear):

```bash
cp "$SRC/vaporwave ui_button-09.png" public/images/vaporwave-ui/buttons/pause.png
cp "$SRC/vaporwave ui_button-13.png" public/images/vaporwave-ui/buttons/mute.png
cp "$SRC/vaporwave ui_button-17.png" public/images/vaporwave-ui/buttons/unmute.png
ls -l public/images/vaporwave-ui/buttons/
```

Expected: 6 files listed. Total size under 50 KB.

- [ ] **Step 4: Commit**

```bash
git add public/images/vaporwave-ui/buttons/
git commit -m "feat(music): add vaporwave transport button assets"
```

---

## Task 17: Terminal bespoke chrome — CRT bezel

Implements spec §5.1. Wrap the existing `.term` contents in a CRT screen div, add scanline + vignette pseudo-elements, repoint the `--term-*` color variables.

**Files:**
- Modify: `src/components/desktop/apps/Terminal.astro`

- [ ] **Step 1: Update the scoped `<style>` block**

Replace the entire `<style>` block at the top of `Terminal.astro` with:

```css
<style>
	.term {
		--term-bg: #050110;
		--term-fg: var(--neon-cyan);
		--term-dim: #5a8098;
		--term-err: var(--neon-pink-hi);
		--term-ok: var(--neon-cyan);
		--term-dir: var(--neon-lilac);
		--term-prompt: var(--neon-pink);

		display: flex;
		flex-direction: column;
		height: 100%;
		margin: -16px -18px;
		padding: 12px;
		background: var(--term-bg);
		color: var(--term-fg);
		font-family: var(--font-mono);
		font-size: 14px;
		line-height: 1.4;
	}

	.term__crt {
		flex: 1;
		display: flex;
		flex-direction: column;
		background: radial-gradient(ellipse at center, #001018 0%, #000008 90%);
		border: 2px solid #0b2a3a;
		border-radius: 18px / 20px;
		box-shadow:
			inset 0 0 40px rgba(0, 229, 255, 0.2),
			inset 0 0 0 1px rgba(0, 229, 255, 0.3);
		position: relative;
		overflow: hidden;
	}

	.term__crt::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--scanlines);
		pointer-events: none;
		z-index: 1;
	}

	.term__crt::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.5) 100%);
		pointer-events: none;
		z-index: 1;
	}

	.term__output {
		flex: 1;
		overflow-y: auto;
		padding: 14px 16px;
		white-space: pre-wrap;
		word-break: break-word;
		position: relative;
		z-index: 2;
	}

	.term__line {
		min-height: 1em;
	}
	.term__line.t-err { color: var(--term-err); }
	.term__line.t-ok { color: var(--term-ok); }
	.term__line.t-dim { color: var(--term-dim); }
	.term__line.t-dir { color: var(--term-dir); font-weight: bold; }

	.term__input-line {
		display: flex;
		align-items: center;
		padding: 8px 16px 12px;
		gap: 4px;
		border-top: 1px solid rgba(0, 229, 255, 0.2);
		position: relative;
		z-index: 2;
	}

	.term__prompt {
		color: var(--term-prompt);
		white-space: pre;
	}

	.term__input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--term-fg);
		font: inherit;
		caret-color: var(--term-fg);
		padding: 0;
	}

	.term__input::-webkit-input-placeholder {
		color: transparent;
	}
</style>
```

- [ ] **Step 2: Wrap the existing markup in the CRT container**

Update the body of `Terminal.astro` to nest `.term__output` and `.term__input-line` inside a new `.term__crt` div:

```astro
<div class="term">
	<div class="term__crt">
		<div class="term__output" aria-live="polite"></div>
		<div class="term__input-line">
			<span class="term__prompt">mills@millsymills:~$&nbsp;</span>
			<input
				class="term__input"
				type="text"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				aria-label="terminal input"
			/>
		</div>
	</div>
</div>
```

Leave the `<script>` import of `terminal/index` untouched.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Dev-server spot check**

Run `npm run dev`, open the Terminal app. Expect:
- Dark CRT screen with soft phosphor glow inside, scanlines visible, vignette on the corners.
- Prompt `mills@millsymills:~$` in neon-pink.
- Type `ls` → output text in cyan, directory names in lilac.
- Type `nmap 10.0.0.1` → `filtered` lines in pink-high.
- Click anywhere on the output area — input focus returns; cursor visible (caret-color cyan).

- [ ] **Step 5: Commit**

```bash
git add src/components/desktop/apps/Terminal.astro
git commit -m "feat(terminal): add crt bezel + scanlines + phosphor color scheme"
```

---

## Task 18: Music bespoke chrome — cassette chassis + VU + seek

Implements spec §5.2 (markup + CSS). Script changes land in Task 19.

**Files:**
- Modify: `src/components/desktop/apps/Music.astro`

- [ ] **Step 1: Replace the scoped `<style>` block**

Replace the existing `<style>` block in `Music.astro` with the cassette-chassis version:

```css
<style>
	.winamp {
		display: flex;
		flex-direction: column;
		gap: 14px;
		font-family: var(--font-pixel);
	}

	.winamp__cassette {
		display: grid;
		grid-template-columns: 60px 1fr 60px;
		gap: 12px;
		align-items: center;
		padding: 14px 16px;
		background: linear-gradient(180deg, #1a0e3f 0%, #0a0320 100%);
		border: 2px solid var(--neon-lilac);
		border-radius: 6px;
	}

	.winamp__reel {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background:
			radial-gradient(
				circle at center,
				var(--bg-void) 0% 20%,
				var(--neon-pink) 20% 28%,
				var(--bg-raised) 28% 80%,
				var(--neon-cyan) 80% 90%,
				var(--bg-raised) 90% 100%
			);
		box-shadow: 0 0 0 2px var(--neon-cyan);
		animation: winamp-reel-spin 4s linear infinite;
		animation-play-state: paused;
	}

	.winamp__reel--right {
		animation-direction: reverse;
	}

	.winamp__cassette[data-music-state='playing'] .winamp__reel {
		animation-play-state: running;
	}

	@keyframes winamp-reel-spin {
		to { transform: rotate(360deg); }
	}

	.winamp__label {
		text-align: center;
		font-family: var(--font-pixel);
		color: var(--neon-cyan);
		font-size: 9px;
		letter-spacing: 1px;
		text-transform: lowercase;
	}

	.winamp__title {
		display: block;
		font-family: var(--font-pixel);
		font-size: 11px;
		color: var(--neon-pink-hi);
		margin-top: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.winamp__artist {
		display: block;
		font-family: var(--font-screen);
		font-size: 16px;
		color: var(--neon-lilac);
		margin-top: 2px;
	}

	.winamp__time {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-dim);
		margin-top: 4px;
	}

	.winamp__vu {
		display: flex;
		gap: 3px;
		align-items: flex-end;
		height: 30px;
		padding: 6px 8px;
		background: var(--bg-void);
		border: 1px solid var(--bg-edge);
		border-radius: 3px;
	}

	.winamp__vu span {
		display: block;
		flex: 1;
		max-width: 6px;
		background: linear-gradient(0deg, var(--neon-cyan), var(--neon-pink));
		border-radius: 1px;
		height: 50%;
		animation: winamp-vu 0.8s ease-in-out infinite alternate;
		animation-play-state: paused;
	}

	.winamp__vu span:nth-child(2) { animation-delay: 0.1s; }
	.winamp__vu span:nth-child(3) { animation-delay: 0.2s; }
	.winamp__vu span:nth-child(4) { animation-delay: 0.05s; }
	.winamp__vu span:nth-child(5) { animation-delay: 0.15s; }

	.winamp__cassette[data-music-state='playing'] ~ .winamp__vu span {
		animation-play-state: running;
	}

	@keyframes winamp-vu {
		from { height: 20%; }
		to   { height: 100%; }
	}

	.winamp__bar {
		appearance: none;
		width: 100%;
		height: 10px;
		background: var(--bg-raised);
		border: 1px solid var(--neon-lilac);
		border-radius: 4px;
		cursor: var(--c-pointer);
	}

	.winamp__bar::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--neon-pink);
		border: 2px solid var(--bg-void);
		border-radius: 50%;
	}

	.winamp__bar::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--neon-pink);
		border: 2px solid var(--bg-void);
		border-radius: 50%;
	}

	.winamp__controls {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.winamp__btn {
		all: unset;
		cursor: var(--c-pointer);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
		height: 32px;
		padding: 0;
	}

	.winamp__btn img {
		height: 32px;
		width: auto;
		display: block;
	}

	.winamp__btn:active img {
		transform: translate(1px, 1px);
	}

	.winamp__playlist {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 180px;
		overflow-y: auto;
		background: var(--bg-deep);
		border: 1px solid var(--bg-edge);
		border-radius: 4px;
	}

	.winamp__track {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px;
		font-family: var(--font-screen);
		font-size: 16px;
		color: var(--ink-primary);
		cursor: var(--c-pointer);
		border-bottom: 1px solid var(--bg-edge);
	}

	.winamp__track:last-child { border-bottom: none; }

	.winamp__track:hover {
		background: var(--bg-raised);
	}

	.winamp__track--current {
		background: var(--bg-raised);
		color: var(--neon-cyan);
	}

	.winamp__track__num {
		font-family: var(--font-pixel);
		font-size: 9px;
		color: var(--ink-dim);
		flex-shrink: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.winamp__reel,
		.winamp__vu span {
			animation: none !important;
		}
		.winamp__reel {
			transform: rotate(45deg);
		}
	}
</style>
```

- [ ] **Step 2: Replace the markup**

Update the Astro template section of `Music.astro` to match the cassette structure. The `data-music-*` attributes remain intact so `scripts/music.ts` still wires up:

```astro
<div class="winamp">
	<div class="winamp__cassette" data-music-state="paused">
		<div class="winamp__reel winamp__reel--left" aria-hidden="true"></div>
		<div class="winamp__label">
			◉ now playing
			<span class="winamp__title" data-music-title>(no track loaded)</span>
			<span class="winamp__artist" data-music-artist>—</span>
			<div class="winamp__time">
				<span data-music-current>00:00</span>
				<span data-music-status>idle</span>
				<span data-music-duration>00:00</span>
			</div>
		</div>
		<div class="winamp__reel winamp__reel--right" aria-hidden="true"></div>
	</div>

	<div class="winamp__vu" aria-hidden="true">
		<span></span><span></span><span></span><span></span><span></span>
	</div>

	<input
		type="range"
		min="0"
		max="100"
		value="0"
		step="0.1"
		class="winamp__bar"
		data-music-seek
		aria-label="seek"
	/>

	<div class="winamp__controls">
		<button type="button" class="winamp__btn" data-music-prev aria-label="previous">
			<img src="/images/vaporwave-ui/buttons/prev.png" alt="" aria-hidden="true" />
		</button>
		<button type="button" class="winamp__btn" data-music-play aria-label="play / pause">
			<img src="/images/vaporwave-ui/buttons/play.png" alt="" aria-hidden="true" />
		</button>
		<button type="button" class="winamp__btn" data-music-next aria-label="next">
			<img src="/images/vaporwave-ui/buttons/next.png" alt="" aria-hidden="true" />
		</button>
		<button type="button" class="winamp__btn" data-music-mute aria-label="mute / unmute">
			<img src="/images/vaporwave-ui/buttons/unmute.png" alt="" aria-hidden="true" />
		</button>
	</div>

	<ol class="winamp__playlist">
		{
			playlist.map((t, i) => (
				<li
					class="winamp__track"
					data-music-track={t.id}
					data-music-src={t.src}
					data-music-track-title={t.title}
					data-music-track-artist={t.artist}
				>
					<span class="winamp__track__num">{String(i + 1).padStart(2, '0')}</span>
					<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
						{t.title}
					</span>
					<span style="font-size:13px;color:var(--ink-muted)">{t.artist}</span>
				</li>
			))
		}
	</ol>

	<audio data-music-audio preload="none"></audio>
</div>
```

Note: the initial mute button shows `unmute.png` because the player starts unmuted (loud speaker icon = "audio is on, click to mute"). Task 19 handles the state-driven swap.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/desktop/apps/Music.astro
git commit -m "feat(music): replace winamp display with cassette + reels + raster transport"
```

---

## Task 19: Music script updates — state toggle + img.src swap

Implements spec §5.2 script change. Two small additions to `scripts/music.ts`: (a) set `data-music-state` on the cassette element so CSS animations pause/run with the audio, (b) swap the `<img src>` of the play and mute buttons when state changes, instead of swapping text content.

**Files:**
- Modify: `src/scripts/music.ts`

- [ ] **Step 1: Cache the cassette element and button `<img>` references**

In the `MusicPlayer` class, add fields and grab them in the constructor. Find the class field declarations (around line 22) and add:

```typescript
	private cassetteEl: HTMLElement | null;
	private playImg: HTMLImageElement | null;
	private muteImg: HTMLImageElement | null;
```

In the constructor (around line 38), add grabs after `this.muteBtn = ...`:

```typescript
		this.cassetteEl = root.querySelector<HTMLElement>('[data-music-state]');
		this.playImg = this.playBtn?.querySelector<HTMLImageElement>('img') ?? null;
		this.muteImg = this.muteBtn?.querySelector<HTMLImageElement>('img') ?? null;
```

- [ ] **Step 2: Update `bindAudioEvents` to drive `data-music-state`**

Find the `bindAudioEvents()` method (around line 67). Update the `play` and `pause` handlers:

```typescript
	private bindAudioEvents(): void {
		this.audio.addEventListener('timeupdate', () => this.renderTime());
		this.audio.addEventListener('durationchange', () => this.renderTime());
		this.audio.addEventListener('ended', () => this.next());
		this.audio.addEventListener('play', () => {
			this.setStatus('playing');
			this.setPlayGlyph('pause');
			this.cassetteEl?.setAttribute('data-music-state', 'playing');
			this.emitNowPlaying();
		});
		this.audio.addEventListener('pause', () => {
			this.setStatus('paused');
			this.setPlayGlyph('play');
			this.cassetteEl?.setAttribute('data-music-state', 'paused');
			this.emitNowPlaying({ playing: false });
		});
		this.audio.addEventListener('error', () => {
			this.setStatus('track unavailable');
			this.cassetteEl?.setAttribute('data-music-state', 'paused');
			if (this.titleEl) this.titleEl.textContent = '(404 — drop audio into public/audio/)';
			this.emitNowPlaying({ playing: false });
		});
	}
```

- [ ] **Step 3: Update `toggleMute` to swap image instead of text**

Find `toggleMute()` (around line 126). Replace:

```typescript
	private toggleMute(): void {
		this.audio.muted = !this.audio.muted;
		if (this.muteImg) {
			this.muteImg.src = this.audio.muted
				? '/images/vaporwave-ui/buttons/mute.png'
				: '/images/vaporwave-ui/buttons/unmute.png';
		}
	}
```

- [ ] **Step 4: Update `setStatus` signature + add `setPlayGlyph`**

The old `setStatus(text, playGlyph?)` overloaded the status element with both text and glyph responsibilities. Split them:

```typescript
	private setStatus(text: string): void {
		if (this.statusEl) this.statusEl.textContent = text;
	}

	private setPlayGlyph(which: 'play' | 'pause'): void {
		if (!this.playImg) return;
		this.playImg.src =
			which === 'pause'
				? '/images/vaporwave-ui/buttons/pause.png'
				: '/images/vaporwave-ui/buttons/play.png';
	}
```

- [ ] **Step 5: Remove the old `playGlyph` calls**

Search `src/scripts/music.ts` for the old pattern `this.setStatus('playing', '⏸')` etc. and ensure all three handlers (play / pause / error) now call the split helpers (see Step 2). The standalone error handler needs:

```typescript
		this.audio.addEventListener('error', () => {
			this.setStatus('track unavailable');
			// ... rest unchanged
		});
```

Other callers of `setStatus` (in the catch branches for `this.audio.play()` failures) stay as-is — they only pass text.

- [ ] **Step 6: Run typecheck**

```bash
npm run check
```

Expected: no errors. If TypeScript complains about stricter `setStatus` signature, confirm every call-site passes only text.

- [ ] **Step 7: Dev-server spot check**

Run `npm run dev`, open winamp.exe. Expect:
- Two static cassette reels (not spinning yet — audio is paused).
- Click play — the actual audio file likely 404s (no real audio in `public/audio/` yet) → title flips to "(404 — drop audio into public/audio/)" and reels stay still. `data-music-state="paused"` on the cassette element.
- If a valid audio file IS present, click play → reels start spinning, VU bars start dancing, `data-music-state="playing"`. Click the play button (now showing pause icon) → reels stop, state flips to `paused`, icon flips back to play.
- Click mute button — icon swaps between mute and unmute PNGs. Audio volume respects `muted`.

- [ ] **Step 8: Commit**

```bash
git add src/scripts/music.ts
git commit -m "feat(music): toggle data-music-state + swap play/mute button images"
```

---

## Task 20: Memes bespoke chrome — polaroids + letterbox + zine header

Implements spec §5.3. Wraps each tile in a polaroid with a square dark letterbox frame, deterministically rotates per-tile based on meme id, and relabels the header as "memes, a zine" in Franklin Gothic italic.

**Files:**
- Modify: `src/components/desktop/apps/Memes.astro`

- [ ] **Step 1: Add a deterministic rotation helper in the Astro frontmatter**

Open `src/components/desktop/apps/Memes.astro`. Update the frontmatter block at the top:

```astro
---
import { memes } from '../../../data/memes';

// Deterministic rotation in [-3.0, +3.0] degrees from the meme id.
// Hash stays stable across SSR ↔ CSR hydration.
function rotationFor(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) | 0;
	}
	return ((h % 600) / 100) - 3; // -3.00 … +2.99
}

// Show a tape strip on every third tile.
function hasTape(index: number): boolean {
	return index % 3 === 0;
}
---
```

- [ ] **Step 2: Replace the scoped `<style>` block**

```css
<style>
	.memes__header {
		font-family: var(--font-xp-display);
		font-style: italic;
		color: var(--neon-pink-hi);
		font-size: 26px;
		margin: 0 0 18px;
		letter-spacing: 1px;
		text-shadow: 2px 2px 0 var(--neon-cyan);
		text-transform: lowercase;
	}

	.memes__intro {
		font-family: var(--font-screen);
		font-size: 17px;
		color: var(--ink-muted);
		margin: 0 0 20px;
	}

	.memes__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 28px 22px;
		margin: 0;
		padding: 0;
		list-style: none;
		align-items: start;
	}

	.memes__tile {
		position: relative;
	}

	.memes__polaroid {
		background: #f5edff;
		padding: 8px 8px 28px;
		border: 1px solid var(--bg-void);
		box-shadow: 4px 4px 0 var(--neon-cyan), 0 0 0 1px var(--bg-void) inset;
		transform: rotate(var(--r, -2deg));
		position: relative;
		display: flex;
		flex-direction: column;
		transition: transform 200ms ease;
	}

	.memes__polaroid:hover {
		transform: rotate(0deg) scale(1.02);
	}

	.memes__tape {
		position: absolute;
		top: -6px;
		left: 25%;
		right: 25%;
		height: 18px;
		background: rgba(255, 79, 168, 0.7);
		border: 1px dashed rgba(255, 255, 255, 0.3);
		transform: rotate(-4deg);
	}

	.memes__img-frame {
		background: var(--bg-void);
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1 / 1;
		overflow: hidden;
	}

	.memes__img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	.memes__placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-pixel);
		font-size: 9px;
		text-align: center;
		color: var(--ink-dim);
		padding: 8px;
	}

	.memes__cap {
		position: absolute;
		bottom: 6px;
		left: 0;
		right: 0;
		text-align: center;
		font-family: var(--font-pixel);
		font-size: 8px;
		color: var(--bg-void);
		letter-spacing: 1px;
		text-transform: lowercase;
	}

	@media (prefers-reduced-motion: reduce) {
		.memes__polaroid,
		.memes__polaroid:hover {
			transition: none;
		}
	}
</style>
```

- [ ] **Step 3: Replace the markup**

```astro
<h3 class="memes__header">memes, a zine</h3>

<p class="memes__intro">
	a small but earnest collection. drop more into <code>public/images/memes/</code> and add
	entries in <code>src/data/memes.ts</code>.
</p>

<ul class="memes__grid">
	{
		memes.map((m, i) => (
			<li class="memes__tile">
				<div class="memes__polaroid" style={`--r: ${rotationFor(m.id).toFixed(2)}deg`}>
					{hasTape(i) && <div class="memes__tape" aria-hidden="true" />}
					<div class="memes__img-frame">
						<img class="memes__img" src={m.src} alt={m.alt} loading="lazy" decoding="async" />
						<div class="memes__placeholder" hidden>
							{m.id}.jpg pending — drop into <br />public/images/memes/
						</div>
					</div>
					<div class="memes__cap">{m.id}</div>
				</div>
			</li>
		))
	}
</ul>
```

Replace any existing `h1` usage (e.g. `<h1>memes/</h1>`) with the new `h3.memes__header`. The intro paragraph structure stays — just the class name shifts to `memes__intro`.

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Dev-server spot check**

Open memes/ app. Each tile is a rotated cream polaroid on a dark background with the whole meme visible inside a square dark letterbox. Every third tile has a pink washi-tape strip near the top. Hovering a tile gently un-rotates and scales it up slightly.

- [ ] **Step 6: Commit**

```bash
git add src/components/desktop/apps/Memes.astro
git commit -m "feat(memes): wrap tiles in rotated polaroids with letterbox frames"
```

---

## Task 21: Photos bespoke chrome — film strip + contact-sheet grid

Implements spec §5.4. Split the gallery into a top 35mm film strip (first 3 photos) and a contact-sheet grid below (remaining photos). Use `object-fit: cover` to preserve the cropped-frame aesthetic.

**Files:**
- Modify: `src/components/desktop/apps/Photos.astro`

- [ ] **Step 1: Update frontmatter to compute strip/grid split**

```astro
---
import { photos } from '../../../data/profile';

const stripCount = Math.min(3, photos.length);
const stripPhotos = photos.slice(0, stripCount);
const gridPhotos = photos.slice(stripCount);
---
```

- [ ] **Step 2: Replace the scoped `<style>` block**

```css
<style>
	.gallery__intro {
		font-family: var(--font-screen);
		font-size: 16px;
		color: var(--ink-muted);
		margin: 0 0 16px;
	}

	.gallery__strip {
		background: #050110;
		padding: 18px 8px;
		display: flex;
		gap: 8px;
		position: relative;
		margin: 0 -18px 16px;
		overflow: hidden;
	}

	.gallery__strip::before,
	.gallery__strip::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 18px;
		background-image: radial-gradient(circle at 12px center, var(--bg-deep) 4px, transparent 4.5px);
		background-size: 24px 18px;
		background-repeat: repeat-x;
	}

	.gallery__strip::before { top: 0; }
	.gallery__strip::after  { bottom: 0; }

	.gallery__slide {
		flex: 1;
		aspect-ratio: 1 / 1;
		background: var(--bg-deep);
		border: 2px solid var(--neon-cyan);
		padding: 4px;
		position: relative;
		min-width: 0;
	}

	.gallery__slide img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		filter: saturate(1.1) hue-rotate(-4deg);
	}

	.gallery__tag {
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--font-pixel);
		font-size: 7px;
		background: var(--neon-pink);
		color: var(--bg-void);
		padding: 2px 6px;
		letter-spacing: 1px;
		white-space: nowrap;
		box-shadow: 2px 2px 0 var(--bg-void);
		text-transform: lowercase;
	}

	.gallery__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 18px 14px;
		margin: 0;
		padding: 0;
	}

	.gallery__cell {
		margin: 0;
		border: 2px solid var(--neon-pink);
		padding: 6px 6px 22px;
		background: var(--bg-raised);
		position: relative;
		box-shadow: 3px 3px 0 var(--neon-cyan);
	}

	.gallery__cell img {
		width: 100%;
		aspect-ratio: 1 / 1;
		object-fit: cover;
		display: block;
		filter: contrast(1.05) saturate(0.95);
		border: 1px solid var(--bg-void);
	}

	.gallery__cell figcaption {
		position: absolute;
		bottom: 4px;
		left: 0;
		right: 0;
		text-align: center;
		font-family: var(--font-pixel);
		font-size: 7px;
		color: var(--neon-cyan);
		letter-spacing: 1px;
		text-transform: lowercase;
	}

	@media (max-width: 520px) {
		.gallery__strip {
			margin: 0 -16px 16px;
		}
		.gallery__grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
```

- [ ] **Step 3: Replace the markup**

```astro
<h1>photos/</h1>

<p class="gallery__intro">
	the cats. drop the real files into <code>public/images/cats/</code> and update names in
	<code>src/data/profile.ts</code>.
</p>

{stripPhotos.length > 0 && (
	<div class="gallery__strip">
		{stripPhotos.map((p, i) => (
			<div class="gallery__slide">
				<img src={p.src} alt={p.alt} loading="lazy" decoding="async" />
				<span class="gallery__tag">{String(i + 1).padStart(2, '0')} · {p.caption}</span>
			</div>
		))}
	</div>
)}

{gridPhotos.length > 0 && (
	<div class="gallery__grid">
		{gridPhotos.map((p, i) => (
			<figure class="gallery__cell">
				<img src={p.src} alt={p.alt} loading="lazy" decoding="async" />
				<figcaption>{String(i + stripCount + 1).padStart(2, '0')} · {p.caption}</figcaption>
			</figure>
		))}
	</div>
)}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Dev-server spot check**

Open photos/ app. Expect a horizontal film-strip row with sprocket perforations on top + bottom and cyan-bordered square slides showing the first photos with pink tag labels. Below (if there are more photos), a contact-sheet grid with pink-bordered cells + cyan shadows + cyan captions. At the current 2-photo count: strip shows 2, grid is hidden.

- [ ] **Step 6: Commit**

```bash
git add src/components/desktop/apps/Photos.astro
git commit -m "feat(photos): split into film strip + contact sheet grid"
```

---

## Task 22: Phase 2 verification gate

**Files:** none modified.

- [ ] **Step 1: Typecheck**

```bash
npm run check
```

- [ ] **Step 2: Production build**

```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: build succeeds. `dist/images/vaporwave-ui/buttons/` contains 6 files. Total `dist/` growth vs Phase 1 ~25 KB.

- [ ] **Step 3: Dev server smoke — four hero apps**

Run `npm run dev`, open each hero app in turn:

**Terminal:**
- CRT screen with scanlines + vignette, phosphor glow on borders.
- Cursor visible, pink prompt, cyan default output.
- Type a few commands and verify scroll + input focus work.

**Music (winamp.exe):**
- Cassette chassis with two reels + VU meters + seek bar + raster transport buttons + playlist.
- Click play — reels spin, VU bars animate (when a playable track exists).
- Click play again — reels stop, icon flips.
- Click mute — icon flips between mute / unmute PNGs.

**Memes:**
- Header "memes, a zine" in Franklin Gothic italic with cyan drop shadow.
- Tiles render as rotated polaroids with letterbox-framed whole images.
- Every third tile has a pink washi-tape strip.
- Hover a tile — gently unrotates and scales.

**Photos:**
- Top: horizontal film strip with sprocket holes and cyan-bordered slides + pink index tags.
- Below: contact-sheet grid with pink-bordered cells (or empty at the current photo count — either way no JS errors).

- [ ] **Step 4: Mobile viewport smoke**

Devtools responsive mode at 390px — open each hero app via the mobile shell. Hero chrome should either render scaled sensibly or fall back to the base chrome — no horizontal overflow, no clipped text, no broken layouts.

- [ ] **Step 5: Reduced motion spot check**

Toggle `prefers-reduced-motion: reduce` in devtools. In Music: reels static. In Memes: polaroid hover-unrotate disabled. In Terminal: scanlines still render (static overlay, correctly).

- [ ] **Step 6: Optional milestone tag**

```bash
git tag phase-2-hero-apps
```

---

# Phase 3 — Polish

Final cleanup pass: swap the wallpaper to a dark vaporwave variant, catch any last hardcoded colors, and confirm the build is shippable.

---

## Task 23: Replace desktop wallpaper

**Files:**
- Replace: `public/images/desktop-background.jpg`

- [ ] **Step 1: Pick a replacement wallpaper**

Options (in order of preference):

1. **Hand-pick from the NullTale pack.** The WinXp wallpapers ship in `~/Downloads/assets/WinXp/Wallpapers/`. Look for a dark variant — vaporwave-toned, moody, works as a dim backdrop.

2. **Render a CSS-gradient-to-image.** Use a tool like `ffmpeg` or Preview → Export to bake a 1920×1080 JPG of a purple→magenta→navy gradient. Minimal but ships.

3. **Use AI-generated or licensed stock.** Any dark vaporwave background (synthwave sky, retrowave landscape, Japanese-city-at-night) works. Target size < 200 KB JPG.

- [ ] **Step 2: Replace the existing file**

```bash
ls -l public/images/desktop-background.jpg   # snapshot current size
cp <chosen-source> public/images/desktop-background.jpg
ls -l public/images/desktop-background.jpg   # confirm replaced
```

Keep the same filename so `desktop.css` doesn't need updating.

- [ ] **Step 3: Dev-server smoke**

```bash
npm run dev
```

In the browser: wallpaper should be dark, not pink. Sparkle layers (cyan + pink) should read clearly against it. Desktop icons should remain legible (their text-shadow was tuned for a dark backdrop in Task 8).

- [ ] **Step 4: Commit**

```bash
git add public/images/desktop-background.jpg
git commit -m "content: swap desktop wallpaper to dark vaporwave variant"
```

---

## Task 24: Final audit pass + Phase 3 verification gate

**Files:** none expected to change — but grep for stragglers.

- [ ] **Step 1: Grep the whole codebase for any hardcoded pink that escaped audit**

```bash
grep -rnE '#(ffaad7|ff7ec0|e62b8c|ff4fa8|fff9f3|fff0f7|ffd6ec)' \
  src/ public/ \
  --include='*.astro' --include='*.ts' --include='*.css'
```

Expected: empty output. Any remaining matches (that aren't in commented-out code or the design spec doc reference) should be converted to the relevant neon-noir token.

- [ ] **Step 2: Full CI**

```bash
./scripts/ci-local.sh
```

Expected: passes all stages.

- [ ] **Step 3: Production build**

```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: clean build. `dist/` total growth from baseline should be ~100 KB (wallpaper + vaporwave-ui assets + noise).

- [ ] **Step 4: Lighthouse accessibility check**

In Chrome devtools, run Lighthouse on `npm run preview` (desktop + mobile emulation). Target: accessibility score unchanged or higher than baseline. Any new regressions (contrast warnings, missing alt text) should be fixed before ship. Decorative images we added all have `alt=""` / `aria-hidden="true"` — confirm Lighthouse agrees.

- [ ] **Step 5: Final commit (only if audit step 1 surfaces fixes)**

If Step 1 found stragglers:

```bash
git add <affected files>
git commit -m "refactor: convert final straggler hardcoded colors to vaporwave tokens"
```

If nothing needed fixing, no additional commit required.

- [ ] **Step 6: Optional milestone tag**

```bash
git tag phase-3-polish
```

---

## Post-plan checklist (informational, no steps)

After all three phases ship, the final state of the site should match the spec:

- Site-wide neon-noir vaporwave chrome replacing the Y2K-pink XP look.
- Base window chrome: dark body, cyan border, pink offset shadow, rainbow-gradient lowercase titlebar, raster window-control icons.
- Taskbar + start menu + command palette + help overlay + reset confirm + clippy bubble + flag toasts: all re-palette'd.
- Mobile shell + boot overlay: re-palette'd.
- Terminal: CRT bezel with scanlines, phosphor glow, neon-pink prompt.
- Music: cassette chassis with spinning reels driven by audio state, VU bars, raster transport buttons.
- Memes: rotated polaroids with letterbox frames, zine header in Franklin Gothic italic.
- Photos: film strip + contact-sheet grid.
- Accessibility: WCAG-passing contrast, reduced-motion honored, prefers-contrast honored.
- Asset budget: +~100 KB over baseline (window icons + buttons + noise + wallpaper).
- `CLAUDE.md` documents the new theme + lowercase rule + asset directory layout.
