# Vaporwave chrome

**Status:** draft design, 2026-04-21
**Brainstorm log:** this doc captures the Q&A flow from `/superpowers:brainstorming` on 2026-04-21 that chose the direction (full swap), fidelity (hybrid), palette (neon noir), motifs, and per-app scope.
**Tracks:** umbrella redesign of the desktop chrome. Uses the `VAPORWAVE USER INTERFACE` asset pack (`~/Downloads/assets/VAPORWAVE USER INTERFACE`) as raster source material.

**Goal:** Replace the current Y2K‑pink XP chrome with a neon‑noir vaporwave theme. CSS owns anything that must scale (windows, panels, taskbar, mobile shell); raster PNGs from the asset pack appear where they shine at native size (window controls, music transport buttons, selected decorative icons). Four apps — Terminal, Music, Memes, Photos — get bespoke chrome; the rest inherit a clean base.

## Why

The site's current chrome is Y2K‑XP pink + Tahoma titlebars + chunky purple outlines — coherent, but a specific reference (`src/styles/desktop.css`). The NullTale WinXp pack closed the XP personality question (#95); the `VAPORWAVE USER INTERFACE` pack now offers a different, denser aesthetic that fits the site's playful‑retro posture better and introduces raster‑native surfaces (buttons, window controls, menu panels, icons) we can drop in. A theme shift also unlocks the hero‑app variants (Terminal as a CRT, Music as a cassette, Memes as a zine, Photos as a contact sheet) that the current flat XP chrome doesn't really support.

## Design decisions (locked during brainstorming)

1. **Direction: full swap** — Y2K‑pink XP chrome is replaced, not layered. The legacy `--pink-*` token names are repointed to new hues (not renamed) so unrelated code keeps working. Re-palette, not rewrite.
2. **Fidelity: hybrid** — CSS handles chrome that must scale (windows, titlebars, taskbar, menus, mobile shell). Raster PNGs from the pack are used only where they work at native size: window controls, Music transport buttons, selected decorative icons. Avoids the distortion risk of stretching fixed‑size PNGs across user‑resizable windows.
3. **Palette: Neon Noir** — deep navy/black background, hot pink + cyan dominant accents, lilac/cream supporting. Full token set in §1 below.
4. **Motifs (kept):** CRT scanlines, chromatic aberration on focus/hover, grain/VHS static overlay, amplified starfield, chunky offset shadows (re‑palette'd cyan‑on‑navy from pink‑on‑pink, preserving the site's existing 4px‑solid‑shadow visual DNA).
5. **Motifs (declined):** sunset grid wallpaper, katakana accents, VHS date/time clock stamp, holographic gradient headline text. Deliberately quieter than full vaporwave poster art.
6. **Per-app scope: hero few** — Terminal, Music, Memes, Photos get bespoke chrome. About, Projects, Resume, Uses, Flags, Mail, Trash stay on the clean base frame so text‑heavy content remains legible.
7. **"mills" is always lowercase** — branding rule, applied in all new UI text, spec docs, code comments, component JSX. Existing chrome already honors this (`mills@millsymills:~$` in the start menu header, lowercase app labels in `src/data/apps.ts`).
8. **No new webfonts.** Existing stack (Press Start 2P, VT323, Franklin Gothic ITC, Tahoma, SF Mono) is sufficient. Tahoma retires from chrome (Press Start 2P takes titlebars); Franklin Gothic ITC italic keeps a cameo in the Memes zine header.
9. **Three-phase rollout.** Foundations PR (tokens + base chrome + motifs + mobile + boot + ancillary re‑palettes) → Hero apps PR (four bespoke bodies) → Polish PR (wallpaper swap, audit cleanup, small tweaks). Each phase is independently revert‑able.

## Scope

**In:**
- `src/styles/desktop.css` — token rebuild, motif utilities, base chrome, ancillary re-palettes, mobile-shell re-palette, boot re-palette. Single file, ~200–300 lines net added/modified.
- `src/components/desktop/Window.astro` — window-control buttons swap ASCII glyphs (`_`, `□`, `✕`) for raster `<img>` references to new PNG icons.
- `src/components/desktop/apps/Terminal.astro` — CRT bezel wrapper, heavy scanline + vignette, re-palette of term colors.
- `src/components/desktop/apps/Music.astro` — cassette chassis with two spinning reels, VU-bar visualizer, raster transport buttons from the pack.
- `src/components/desktop/apps/Memes.astro` — polaroid tile wrapper with `object-fit: contain` letterbox (so whole meme shows), pink washi-tape accents, Franklin Gothic italic zine header.
- `src/components/desktop/apps/Photos.astro` — split into a 35mm film strip (top row) + contact-sheet grid (below), `object-fit: cover` to preserve the cropped-frame aesthetic.
- Ancillary CSS-only re-palettes: `CommandPalette.astro`, `HelpOverlay.astro`, `Clippy.astro`, `ResetConfirm.astro`, `Taskbar.astro`, `Desktop.astro`, `DesktopIcon.astro`, `MobileFallback.astro`.
- Per-app `<style>` audit in About, Projects, Resume, Uses, Flags, Mail, Trash — replace hardcoded pink/cream hex values with the new tokens.
- `public/images/vaporwave-ui/` — new asset directory with only the PNGs we use (3 window controls, 4–5 Music transport buttons, a small set of decorative icons).
- `public/images/noise.png` — new 64–128px tileable grain PNG for the `.motif-grain` overlay, ~2–4 KB.
- `public/images/desktop-background.jpg` — replace with a dark vaporwave variant.
- `CLAUDE.md` — new "Aesthetic conventions" section: neon-noir theme pointer, "mills lowercase" rule, asset directory pointer.

**Out (deliberate):**
- Dual-theme toggle. No XP/vaporwave switcher; full swap is one-way.
- Sunset grid wallpaper, katakana labels, VHS clock, holographic gradient headlines (explicitly declined in brainstorming).
- New webfonts or font-loading changes.
- Any structural change to `DesktopLayout.astro`, `BaseLayout.astro`, `window-manager.ts`, `terminal/repl.ts`, app data files (`apps.ts`, `playlist.ts`, `memes.ts`, `projects.ts`, `profile.ts`, `uses.ts`). This is a visual re-theme, not a functional refactor.
- Any change to ARIA labels, keyboard shortcuts, or route structure.
- Audio / sound effects (filed under #95 item 4, separate).

## Architecture

### 1. Design tokens (`src/styles/desktop.css`, `:root`)

Legacy `--pink-*`, `--lilac-*`, `--cream`, `--ink`, `--ink-soft`, `--border`, `--titlebar-bg`, `--titlebar-fg`, `--window-bg`, `--window-shadow` variable names are **kept** — only their values change. Any code elsewhere that references them keeps working with new hues automatically.

**New tokens (add):**

```css
:root {
  /* Surface hierarchy */
  --bg-void:       #0a0320;
  --bg-deep:       #140832;
  --bg-raised:     #1e0f44;
  --bg-edge:       #2a1654;

  /* Ink */
  --ink-primary:   #f5edff;
  --ink-muted:     #c8a8ff;
  --ink-dim:       #8a6bb8;

  /* Accents */
  --neon-pink:     #ff4fa8;
  --neon-pink-hi:  #ff7ec0;
  --neon-pink-lo:  #e62b8c;
  --neon-cyan:     #00e5ff;
  --neon-cyan-hi:  #66f0ff;
  --neon-cyan-lo:  #00a8c2;
  --neon-lilac:    #c8a8ff;

  /* Motif layers */
  --scanlines: repeating-linear-gradient(
                 0deg, transparent 0 2px, rgba(0,0,0,0.35) 2px 3px);
  --grain: url('/images/noise.png');

  /* Chrome */
  --chrome-border-width: 2px;
  --chrome-radius-window: 10px;
  --chrome-radius-button: 4px;
}
```

**Legacy tokens (repoint values):**

```css
:root {
  --pink-50:   #241055;   /* was #fff0f7 */
  --pink-100:  #2a1654;
  --pink-200:  #3b1d70;
  --pink-300:  #ff7ec0;
  --pink-400:  #ff4fa8;
  --pink-500:  #e62b8c;
  --pink-600:  #ff4fa8;
  --lilac-100: #2a1654;
  --lilac-300: #c8a8ff;
  --cream:     #f5edff;
  --ink:       #f5edff;
  --ink-soft:  #c8a8ff;
  --border:    #00e5ff;

  --titlebar-bg: linear-gradient(90deg, #ff4fa8 0%, #c8a8ff 50%, #00e5ff 100%);
  --titlebar-fg: #0a0320;
  --window-bg:   #140832;
  --window-shadow: 4px 4px 0 0 var(--neon-cyan);
}
```

### 2. Typography

No new fonts. Role shifts only:

| Font (@font-face or system) | Current role | New role |
|---|---|---|
| Press Start 2P | Display, chrome labels | **Same** — titlebars, start menu header, taskbar labels, buttons |
| VT323 | Body in windows | **Same** — window bodies, terminal output, music labels |
| Tahoma | Window titlebars | **Retired from chrome** — kept available, unused by default |
| Franklin Gothic ITC italic | Display | Kept for occasional ransom-note accents (Memes zine header) |
| SF Mono / Menlo (system) | Terminal monospace | **Same** |

### 3. Motif infrastructure

Three new utility CSS blocks in `desktop.css`:

**`.motif-scanlines`** — opt-in per surface. Adds a `::after` pseudo-element with `background: var(--scanlines)`. Default opacity 1 (full strength). Terminal gets this strongly; start menu, command palette, help overlay get it at `opacity: 0.25` via `.motif-scanlines--soft` modifier.

**`.motif-grain`** — added as a dedicated fixed-position overlay element that sits above everything except modals: a single `<div class="motif-grain" aria-hidden="true">` mounted once in `DesktopLayout.astro`. `position: fixed`, `inset: 0`, `background-image: var(--grain)`, `background-repeat: repeat`, `mix-blend-mode: overlay`, `opacity: 0.04`, `pointer-events: none`, `z-index: 9998` (below taskbar's `z-index: 9999` so it doesn't blur the chrome labels, above windows so grain actually shows on their surfaces). One tiny tileable PNG, static, no animation.

**`.motif-chrom`** — opt-in, applied to text elements. Pulls in `:hover` / `:focus-visible` state:

```css
.motif-chrom:hover,
.motif-chrom:focus-visible {
  text-shadow: -1.5px 0 0 var(--neon-pink),
                1.5px 0 0 var(--neon-cyan);
}
```

Applied to: window titlebar text, start menu items, taskbar clock, taskbar items, window-control buttons. Explicitly NOT applied in a persistent state — the effect only fires on hover/focus to stay non-intrusive for accessibility.

**Starfield amplification** — the existing `.desktop::before / ::after` pseudo-elements get a twin pair via a wrapper layer using neon-cyan and neon-pink glyphs rotating the opposite direction, plus a `@keyframes twinkle` fade (disabled under `prefers-reduced-motion`).

### 4. Base chrome

**`.window`**
- `background: var(--window-bg)` — deep navy surface
- `border: var(--chrome-border-width) solid var(--neon-cyan)`
- `box-shadow: var(--window-shadow)` — 4px pink offset (inverts from current pink-shadow-on-cream to pink-shadow-on-navy)
- `border-radius: var(--chrome-radius-window)`
- Grain overlay shows through `.motif-grain` at body level.

**`.window__titlebar`**
- `background: var(--titlebar-bg)` — horizontal pink→lilac→cyan gradient
- `color: var(--bg-void)` — dark text on bright gradient
- `font-family: var(--font-pixel)` at 10px (was Tahoma 13px)
- `border-bottom: 2px solid var(--bg-void)`
- Classes: `.motif-chrom` on `.window__title` inner span (chromatic aberration on drag/focus)

**`.window-control`** (the three buttons)
- Children become `<img src="/images/vaporwave-ui/ui-icons/{minimize|maximize|close}.png" alt="..." class="window-control__icon">` instead of ASCII glyphs. `.window-control` keeps its existing CSS shape (22×22 button with border, hover, active transform) but the `background: var(--cream)` → `background: var(--bg-void)` and `border` color flip.
- Hover: background → `var(--neon-pink)`, shadow flip → `var(--neon-cyan)`.
- Close hover: keep the pink-intensified color pattern (currently `--pink-400` → becomes `--neon-pink-lo`).

**`.window__body`**
- `background: var(--bg-deep)`
- `color: var(--ink-primary)`
- Headings `h1/h2/h3` in `var(--neon-pink)` (was `var(--pink-600)` which is now repointed).
- Links in `var(--neon-cyan)` with 2px underline offset.
- `code` / `pre` — `background: var(--bg-raised)`, `border: 1px solid var(--neon-lilac)`, `color: var(--neon-cyan)`.

**`.taskbar`**
- `background: var(--bg-deep)`
- `border-top: 2px solid var(--neon-pink)`
- `box-shadow: 0 -2px 0 var(--neon-cyan) inset` (was the inset white highlight)
- Items get the same re-palette: `.taskbar-item` → `background: var(--bg-raised)`, active `background: var(--bg-void)` with `border: 2px solid var(--neon-cyan)`.

**`.taskbar__start`**
- `background: var(--bg-void)` (was `--cream`)
- `color: var(--neon-cyan)`
- `border: 2px solid var(--neon-pink)`
- The `★` glyph becomes `color: var(--neon-cyan)` with `filter: drop-shadow(1px 1px 0 var(--neon-pink))`
- Hover: background → `var(--neon-pink)`, text → `var(--bg-void)`

**`.taskbar__clock`**
- `background: var(--bg-void)`, `color: var(--neon-cyan)`, `border: 2px solid var(--neon-pink)`. Declined VHS stamp motif — stays as numeric clock in Press Start 2P.

**`.start-menu`**
- Panel uses the `.window` chrome pattern (dark + cyan border + pink shadow).
- `.start-menu__header` — `background: var(--bg-void)`, text in `var(--neon-pink)` with `text-shadow: 0 1px 0 var(--neon-cyan)` (vertical-only; a horizontal offset collides with neighbour pink glyphs at the 11px Press Start 2P chrome size — see #305 / #308). Content `mills@millsymills:~$` unchanged.
- `.start-menu__item` — `color: var(--ink-primary)`, hover `background: var(--bg-raised)` + `color: var(--neon-cyan)`.
- `.start-menu__item--danger` (reset) — `color: var(--neon-pink-hi)`, hover `background: rgba(255, 51, 51, 0.18)`.

**`.desktop`**
- `background-color: var(--bg-void)` fallback.
- `background-image: url('/images/desktop-background.jpg')` — image is replaced (see §8).
- Sparkle pseudo-elements re-palette'd: primary layer `var(--neon-cyan)` at 55% opacity; new secondary layer in `var(--neon-pink)` at 40% opacity, rotated opposite, staggered.

**`.desktop-icon`**
- No structural change.
- Label `color: var(--neon-cyan)`, `text-shadow: 1px 1px 0 var(--bg-void), 0 0 4px var(--neon-pink)` for legibility on dark wallpaper.
- Hover background stays at `rgba(255,255,255,0.22)` — reads as subtle lilac on the dark surface.

### 5. Hero apps

#### 5.1 Terminal (`src/components/desktop/apps/Terminal.astro`)

Wrap the existing `.term` contents in a CRT bezel:

```astro
<div class="term">
  <div class="term__crt">
    <div class="term__screen">
      <div class="term__output" aria-live="polite"></div>
      <div class="term__input-line">…</div>
    </div>
  </div>
</div>
```

Styling (scoped in the component's `<style>` block, not global):
- `.term` — outer frame `background: #050110` (slightly darker than `--bg-void`), no padding change.
- `.term__crt` — doesn't add a visible bezel itself; just the positioning container.
- `.term__screen` — inner screen:
  - `background: radial-gradient(ellipse at center, #001018 0%, #000008 90%)`
  - `border: 2px solid #0b2a3a`
  - `border-radius: 18px / 20px` (asymmetric radius — reads as slightly-curved CRT glass)
  - `box-shadow: inset 0 0 40px rgba(0, 229, 255, 0.2), inset 0 0 0 1px rgba(0,229,255,0.3)` — inner phosphor glow
  - `::before` pseudo-element — scanline overlay, full strength
  - `::after` pseudo-element — vignette via `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)`
  - All text z-indexed above both layers.
- Term colors repointed:
  - `--term-bg` → keep `#100614` (already appropriate)
  - `--term-fg` → `var(--neon-cyan)` (was light pink)
  - `--term-dim` → `#5a8098` (muted cyan-grey)
  - `--term-err` → `var(--neon-pink-hi)` (was light pink)
  - `--term-ok` → `var(--neon-cyan)`
  - `--term-dir` → `var(--neon-lilac)`
  - `.term__prompt` color → `var(--neon-pink)` (distinct from default fg)
- Cursor block: add a 2×1em solid `var(--neon-cyan)` inline caret using the existing input element's `caret-color` — already set. No change needed.

No JS change. The scanline overlay sits above the output layer via `pointer-events: none`, so click/focus on the input is unaffected.

#### 5.2 Music (`src/components/desktop/apps/Music.astro`)

Replace the current winamp-display + bar + controls with:
1. **Cassette chassis** — grid of `[reel · label · reel]`. Reels are CSS-drawn radial gradients with `animation: spin 4s linear infinite` (reversed on right reel). Animation `animation-play-state` toggles between `running` and `paused` via a `data-music-state` attribute on the `.cass` element, driven by existing `mills:now-playing` event listener in `scripts/music.ts`.
2. **Cassette label** — centered text block: `◉ now playing` in Press Start 2P cyan (9px); track title in VT323 ink-primary (18px); artist in VT323 neon-lilac (14px).
3. **VU bar** — 5–7 vertical bars; each `animation: vu 0.8s ease-in-out infinite alternate` with staggered `animation-delay`. Pauses when paused.
4. **Seek bar** — existing `input[type="range"]` re-styled: track `var(--bg-raised)` with `var(--neon-lilac)` border; progress (via `::-webkit-slider-runnable-track` or the `::after` overlay pattern) as pink→cyan gradient.
5. **Transport controls** — the actual Music app has four controls today: `data-music-prev`, `data-music-play` (toggles play/pause), `data-music-next`, `data-music-mute`. No separate stop. All four buttons swap from text/emoji content to `<img>` children sourced from `public/images/vaporwave-ui/buttons/`:
   - `prev.png` — `vaporwave ui_button-03.png` renamed
   - `play.png` — shown when paused (default state)
   - `pause.png` — shown when playing; `scripts/music.ts` already updates the play button's content based on state, so the existing swap point gets a one-line change from text toggle to `img.src` toggle
   - `next.png` — `vaporwave ui_button-11.png` renamed
   - `mute.png` / `unmute.png` — paired icons from the pack; mute PNG shown when audio is muted
   - All native size ~30px tall, `image-rendering: auto`. Exact source selections from within the pack's BUTTONS subfolder are implementer's discretion (see §12).
6. **Playlist** — retained structure, re-palette: `background: var(--bg-deep)`, rows `color: var(--ink-primary)`, current-track row `background: var(--bg-raised)` + `color: var(--neon-cyan)`, track number in Press Start 2P 8px `var(--ink-dim)`.

JS: `scripts/music.ts` gets two small additions — (1) toggle `data-music-state="playing|paused"` on the cassette element so the CSS can pause reel + VU animations; (2) swap the play button's `<img src>` between `play.png` and `pause.png` (and the mute button between `mute.png` / `unmute.png`) at the same place the existing code already updates button text. Event wiring is otherwise identical.

**Reduced motion:** both spin + VU animations respect `@media (prefers-reduced-motion: reduce)` — reels stay static, VU bars fix at a neutral `height: 50%`.

#### 5.3 Memes (`src/components/desktop/apps/Memes.astro`)

Rewrite the tile markup from the current flat image+caption to a polaroid structure:

```astro
<li class="memes__tile" style={`--r: ${randomRotation(m.id)}deg`}>
  <div class="memes__polaroid">
    {optionalTape && <div class="memes__tape" />}
    <div class="memes__img-frame">
      <img class="memes__img" src={m.src} alt={m.alt} loading="lazy" decoding="async" />
      <div class="memes__placeholder" hidden>…</div>
    </div>
    <div class="memes__cap">{m.caption ?? m.id}</div>
  </div>
</li>
```

Styling:
- `.memes__polaroid` — `background: #f5edff` (cream panel against the dark surface), `padding: 8px 8px 28px` (bottom padding for the caption area), `border: 1px solid var(--bg-void)`, `box-shadow: 4px 4px 0 var(--neon-cyan), 0 0 0 1px var(--bg-void) inset`, rotated by `transform: rotate(var(--r, -2deg))` (deterministic from meme id so SSR ↔ CSR matches).
- `.memes__img-frame` — `aspect-ratio: 1/1` square, `background: var(--bg-void)` (dark letterbox), `display: flex; align-items: center; justify-content: center`, `overflow: hidden`.
- `.memes__img` — `max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain` — **whole meme shows**, letterboxed inside the square polaroid frame. This was the v2 revision during brainstorming and the explicit reason Memes differs from Photos.
- `.memes__cap` — Press Start 2P 7px, `color: var(--bg-void)`, centered, absolute bottom, lowercase.
- `.memes__tape` — optional per-tile decorative strip: `position: absolute; top: -6px`, rotated, `background: rgba(255, 79, 168, 0.7)`, `border: 1px dashed rgba(255,255,255,0.3)`. Only applied to some tiles (rotation + tape presence seeded from meme id for stable layout).
- `h1` ("memes/") replaced with `<h3 class="memes__header">memes, a zine</h3>` — `font-family: var(--font-xp-display)` (Franklin Gothic ITC italic), `color: var(--neon-pink-hi)`, `text-shadow: 2px 2px 0 var(--neon-cyan)`, size 26px, lowercase.
- `.memes-body` gets a `::before` light scanline overlay at `opacity: 0.4` for texture.

Deterministic rotation helper: `function rotationFor(id: string): number` — hash the meme id to a stable value in `[-3°, +3°]`, injected as a CSS custom property so SSR and CSR agree.

#### 5.4 Photos (`src/components/desktop/apps/Photos.astro`)

Split the gallery into two sections:

1. **Film strip** (top) — `.gallery__strip` — horizontal flex row of `.gallery__slide` elements. Each slide is a square with `aspect-ratio: 1/1`, cyan border, pink-shift filter. The strip container gets top and bottom pseudo-elements that draw sprocket perforations via `radial-gradient` at `background-size: 24px 20px`. First 3 photos go here with index tags (`01 · <name>` in Press Start 2P, pink chip with void text on cyan shadow).
2. **Contact sheet** (below) — `.gallery__grid` — the existing grid structure renamed. Cells wrapped in `.gallery__cell` with `border: 2px solid var(--neon-pink)`, cyan shadow, pink index caption in Press Start 2P 7px lowercase.

Crop mode: `object-fit: cover` — preserves the contact-sheet aesthetic (uniform cropped frames). Letterbox is not appropriate here; photos are portrait subjects and a crop keeps the grid orderly.

`src/data/profile.ts` photo data: no change. Current data has 2 photos; with fewer than 3 the layout degrades gracefully — the `.gallery__strip` row renders only the photos that exist and the `.gallery__grid` below is empty (hidden if it would be). With 3+ photos, the strip takes the first 3 and the grid takes the rest. Implementer handles the count via a slice on the `photos` array at render time.

### 6. Ancillary surfaces

| Surface | Change |
|---|---|
| `.cmdp` (CommandPalette) | Backdrop `rgba(10,3,32,0.85)`. Panel uses `.window` chrome. Prompt `❯` → `color: var(--neon-pink)`. Selected `.cmdp__option` row: `background: var(--bg-raised)` + `border-left: 3px solid var(--neon-cyan)`. Footer kbd chips: `background: var(--bg-void)`, `border: 1px solid var(--neon-cyan)`. |
| `.help` (HelpOverlay) | Same modal pattern as cmdp. `<kbd>` chips: `background: var(--bg-void)`, `border: 1px solid var(--neon-cyan)`, `color: var(--neon-cyan)`. Section headings `h3` in `var(--neon-pink)`. |
| Clippy speech bubble | Re-palette only: `background: var(--bg-deep)`, `border: 2px solid var(--neon-cyan)`, `box-shadow: 4px 4px 0 var(--neon-pink)`, text `var(--ink-primary)`, tail in cyan. No change to controller logic. |
| `.reset-confirm` | Confirm button: `background: var(--neon-pink-lo)`, `color: var(--ink-primary)`, `box-shadow: 3px 3px 0 #ff3333`. Cancel button: standard chrome. Panel uses `.window` chrome. |
| Boot overlay (`.boot-overlay`) | Text `mills.exe` repointed: `color: var(--neon-cyan)`, `text-shadow: 0 0 8px var(--neon-pink), 0 0 16px var(--neon-cyan)`. Scanline `::after` opacity bumped to `0.08`. `@keyframes boot-crt` unchanged. `prefers-reduced-motion` branch still hides overlay. |
| Flag toasts (`.flag-toast`) | `background: var(--bg-deep)`, `border: 2px solid var(--neon-cyan)`, `border-left: 6px solid var(--neon-pink)`, text `var(--ink-primary)`. Variant for captured flag: left-border `var(--neon-pink)`; neutral/info toast: left-border `var(--neon-cyan)`. |
| `.window__body` children in info-dense apps (About, Projects, Resume, Uses, Flags, Mail, Trash) | Each file has an inline `<style>` block. Grep each for hardcoded `#ff*`, `#e6*`, rgba color literals, and `var(--pink-*)` / `var(--lilac-*)` / `var(--cream)` usages. Replace with the new tokens where the intent matches the new palette (most "pink accent" usages become `var(--neon-pink)`; most "cream surface" usages become `var(--bg-deep)` or `var(--bg-raised)`). |

### 7. Mobile shell (`.mshell`, `@media (max-width: 768px)`)

Dark palette applied, perf kept lean (no chromatic aberration, no sparkles, no grain).

- `html, body` mobile block: `background: var(--bg-void)`. The current diagonal-stripe pink fallback is removed — replaced by a pure-CSS vertical gradient `background: linear-gradient(180deg, var(--bg-void) 0%, var(--bg-deep) 100%)` so mobile has a dark sky without extra assets.
- `.mshell__statusbar` — `background: var(--bg-deep)`, `border-bottom: 2px solid var(--neon-pink)`, sparkles in `var(--neon-cyan)`.
- `.mshell__home-hero h1` — `color: var(--ink-primary)`, `text-shadow: 2px 2px 0 var(--neon-pink)`.
- `.mshell__home-hero p` — `color: var(--ink-muted)`.
- `.mshell-icon` — label `color: var(--neon-cyan)`, shadow `var(--bg-void)`.
- `.mshell-icon__glyph` / `__icon` tiles — `background: var(--bg-raised)`, `border: 2px solid var(--neon-cyan)`, `box-shadow: 2px 2px 0 0 var(--neon-pink)`.
- `.mshell__app-chrome` — `background: var(--bg-deep)`, `border-bottom: 2px solid var(--neon-pink)`, title `color: var(--ink-primary)`.
- `.mshell__chrome-back` — `background: var(--bg-raised)`, `color: var(--neon-cyan)`, `border: 2px solid var(--neon-cyan)`.
- `.mshell__app-body` — `background: var(--bg-deep)`, text `var(--ink-primary)`. Headings `h1/h2/h3` in `var(--neon-pink)` / `var(--neon-cyan)` / `var(--neon-lilac)` respectively.
- `body.mshell-app-open` — `background: var(--bg-deep)` (was `--window-bg` which is now the same value — still fine).

Mobile hero apps (Terminal, Music, Memes, Photos) render their existing bodies through the mobile-shell route (`src/components/desktop/MobileFallback.astro` + `src/pages/[app].astro`). The bespoke Terminal/Music/Memes/Photos CSS in §5 is scoped to their component files and applies on mobile too — confirm in testing that the CRT bezel, cassette chassis, polaroids, and film strip all behave sanely at `width: 320px`. Media queries inside each component may be needed to drop the film-strip-above-grid split to a single grid on narrow viewports.

### 8. Asset pipeline

**New files in `public/images/vaporwave-ui/`:**

| Target path | Source | Size |
|---|---|---|
| `ui-icons/minimize.png` | `VAPORWAVE USER INTERFACE/PNG/UI ICONS/WHITE/vaporwave ui_ui icon wht-02.png` | ~2 KB |
| `ui-icons/maximize.png` | `…/WHITE/vaporwave ui_ui icon wht-05.png` | ~2 KB |
| `ui-icons/close.png` | `…/WHITE/vaporwave ui_ui icon wht-10.png` | ~2 KB |
| `buttons/prev.png` | `…/BUTTONS/vaporwave ui_button-03.png` | ~5 KB |
| `buttons/play.png` | `…/BUTTONS/vaporwave ui_button-07.png` | ~5 KB |
| `buttons/pause.png` | (chosen from remaining pack) | ~5 KB |
| `buttons/next.png` | `…/BUTTONS/vaporwave ui_button-11.png` | ~5 KB |
| `buttons/mute.png` | (chosen from remaining pack — speaker icon) | ~5 KB |
| `buttons/unmute.png` | (chosen from remaining pack — speaker-with-x or similar) | ~5 KB |
| `misc/cassette.png` | `…/MISC ICONS/vaporwave ui_misc icon-03.png` | ~3 KB |
| `misc/cam.png` | `…/MISC ICONS/vaporwave ui_misc icon-24.png` | ~3 KB |

Exact source selections for each are finalized during implementation — the above mirror the samples used in the brainstorm mockups. Final selections are the implementer's judgment call within the pack.

**Other new files:**
- `public/images/noise.png` — 128×128 tileable grain, ~2–4 KB. Generated once (e.g., via a shell one-liner piping `openssl rand` through ImageMagick, or hand-drawn). File committed; not regenerated at build time.
- `public/images/desktop-background.jpg` — replace existing (which is a pink-washed Bliss). Options:
  1. Hand-pick a new dark vaporwave wallpaper (the NullTale pack has several in `~/Downloads/assets/WinXp/Wallpapers/`).
  2. Run an existing recolor script if one is present in `scripts/` and target the new palette.
  3. Commit a new image produced externally.
  Decision deferred to implementation; the Foundations PR fallback is `background-color: var(--bg-void)` so the build works even before the image lands.

**Total new asset budget:** < 50 KB for the PNGs + noise, plus wallpaper (larger). Astro's static-asset pipeline handles everything with no build-system changes.

**`image-rendering: auto`** for all new raster assets — they have soft gradients, not pixel art. The existing cursor PNGs keep their rendering mode untouched.

### 9. File change map

```
src/styles/desktop.css                  # tokens, motifs, base chrome, ancillary, mobile, boot (core diff)
src/components/desktop/Window.astro     # raster <img> in window-control buttons
src/components/desktop/Taskbar.astro    # no JSX change (CSS-only)
src/components/desktop/CommandPalette.astro   # no JSX change (CSS-only)
src/components/desktop/HelpOverlay.astro      # no JSX change (CSS-only)
src/components/desktop/Clippy.astro           # no JSX change (CSS-only)
src/components/desktop/ResetConfirm.astro     # no JSX change (CSS-only)
src/components/desktop/Desktop.astro          # adds one <span class="desktop__sparkle-layer" aria-hidden="true"></span> so the second pink-on-cyan sparkle layer has a real element (::before/::after on .desktop are already claimed by the primary layer)
src/components/desktop/DesktopIcon.astro      # no JSX change (CSS-only)
src/components/desktop/MobileFallback.astro   # no JSX change (CSS-only)

src/components/desktop/apps/Terminal.astro   # CRT bezel wrapper + scanline/vignette + term color repoint
src/components/desktop/apps/Music.astro      # cassette + reels + VU + raster transport buttons
src/components/desktop/apps/Memes.astro      # polaroid structure + letterbox frame + zine header
src/components/desktop/apps/Photos.astro     # film strip + contact grid split

src/components/desktop/apps/{About,Projects,Resume,Uses,Flags,Mail,Trash}.astro
                                         # audit inline <style> for hardcoded hex; replace with tokens

public/images/vaporwave-ui/ui-icons/*.png    # NEW — 3 window controls
public/images/vaporwave-ui/buttons/*.png     # NEW — 4–5 music transport buttons
public/images/vaporwave-ui/misc/*.png        # NEW — 2–3 decor icons (as needed)
public/images/noise.png                      # NEW — tileable grain
public/images/desktop-background.jpg         # REPLACED — dark vaporwave variant

CLAUDE.md                                # NEW SECTION: "Aesthetic conventions" — theme, lowercase rule, asset dir
```

No changes to:
- `astro.config.mjs`, `tsconfig.json`, `package.json`
- `src/scripts/**` (except the two small additions in `music.ts` noted in §5.2: `data-music-state` attribute toggle and play/mute button `img.src` swap)
- `src/data/**`
- `src/pages/**` (including `[app].astro`)
- `infra/**`

`src/layouts/DesktopLayout.astro` gets **one additive line** — the `<div class="motif-grain" aria-hidden="true"></div>` mount for §3. No other layout changes.

### 10. Accessibility & motion

**Contrast (checked against WCAG 2.1):**

| Pair | Ratio | Level |
|---|---|---|
| `--neon-cyan` on `--bg-void` | ~14.5:1 | AAA |
| `--neon-pink` on `--bg-void` | ~7.1:1 | AA large text, borderline AAA |
| `--neon-lilac` on `--bg-void` | ~10.2:1 | AAA |
| `--ink-primary` on `--bg-deep` | ~15.8:1 | AAA |
| `--ink-muted` on `--bg-deep` | ~9.4:1 | AAA |
| `--bg-void` on `--neon-pink` (titlebar text) | ~7.1:1 | AA large |
| `--bg-void` on `--neon-cyan` (titlebar text gradient end) | ~14.5:1 | AAA |

The titlebar gradient middle (`--neon-lilac`) against void text is well above 4.5:1. No contrast failures expected.

**Motion (`@media (prefers-reduced-motion: reduce)`):**
- Disabled: cassette reel spin, VU bar animation, sparkle twinkle, chromatic aberration on hover/focus (via `.motif-chrom` inside the reduced-motion block, falls back to static solid-color text).
- Kept (static): scanlines, grain overlay, radial vignette, text-shadows, cursor blink inside terminal input (browser default caret blink — untouched by our code).
- Existing CRT boot animation already respects reduced-motion (hides the overlay).

**Contrast preference (`@media (prefers-contrast: more)`):**
- Titlebar gradient collapses to solid `var(--neon-pink)`.
- `.motif-grain` removed (opacity → 0).
- `.motif-chrom` hover/focus disabled (no text-shadow on focus).
- `::before`/`::after` scanline and vignette overlays `opacity: 0`.

**Focus visibility:**
- Existing outline pattern `outline: 2px solid var(--cream)` now reads as white-on-dark (since `--cream` is repointed to `#f5edff`) — no code change needed; visibility improves on dark chrome.
- Keyboard navigation unchanged.

**Screen readers:**
- All changes are decorative. ARIA labels, roles, tab order, and focus flow are untouched.

### 11. Verification

Per phase:
1. `npm run check` — Astro typecheck passes.
2. `SITE_URL=https://millsymills.com npm run build` — build completes; `dist/` size inspected for asset budget.
3. `./scripts/ci-local.sh` — full Node + Terraform CI passes.
4. `npm run dev` — manual walkthrough:
   - Desktop ≥769px: each app opens via DesktopIcon, Start menu, and CommandPalette. Window drag/resize/maximize/close all work. No console errors.
   - Terminal: type `help`, `ls`, `nmap 10.0.0.1`, `flag status`; input stays focused through the scanline overlay.
   - Music: play a track; reels spin; pause → reels stop; VU animates; transport buttons respond to click.
   - Memes: tiles render with full image visible, polaroid rotation stable across reloads, no scroll overflow.
   - Photos: film strip on top, grid below, sprocket pseudo-elements align correctly.
   - Command palette (`⌘K`): opens, search works, selection navigates rows, `↵` opens app, `esc` closes.
   - Help overlay (`?`): opens, `esc` closes, keyboard shortcuts table readable.
   - Clippy: appears on boot, speech bubble re-palette'd, dismissable.
   - Reset: triggers from start menu, confirm dialog styled correctly.
   - Boot overlay: CRT animation plays (or skips under reduced motion).
5. Mobile (`<=768px`, responsive devtools at 320/375/414):
   - Statusbar, home hero, grid icons, app chrome, app body all re-palette'd.
   - Hero apps render correctly at narrow widths (media queries may be needed in component `<style>` blocks — discovered during implementation).
   - Touch targets ≥44px.
6. Accessibility toggles:
   - macOS Settings → Accessibility → Display → Reduce motion: animations stop; chromatic aberration disabled on hover; grain stays static.
   - Browser devtools "emulate CSS prefers-contrast: more": gradients flatten; grain removed.
   - Browser devtools "emulate CSS prefers-color-scheme: light": **no effect** — site is dark-only. Does not need to support light mode.
7. Lighthouse accessibility score: target ≥95 (unchanged from current baseline; we're repainting, not restructuring).

### 12. Risks & rollback

**Risks:**
- **Repointed `--pink-*` variables could surprise callers** — any code that assumed pink-family colors means "light pink" will now paint navy. Mitigation: global grep for `--pink-` usages during Foundations PR review; adjust intent-mismatched callers on the spot.
- **Per-app inline `<style>` hardcoded hexes** — the audit in §6 catches these, but the first PR might miss one. Mitigation: explicit grep checklist in the phase-1 PR description.
- **Scanline + grain overlays reducing readability** — mitigated by (a) grain at opacity 0.04, (b) scanlines only on Terminal and soft variant on menus, (c) `prefers-contrast: more` toggle that removes both.
- **Spinning cassette reels running forever waste CPU on idle tabs** — mitigated by `animation-play-state` toggle driven by actual audio state; music.ts already emits the `mills:now-playing` event with `playing: false` when paused.
- **Astro scoped-style ordering with the added motif utilities** — `desktop.css` is imported once at the top; new utility classes `.motif-*` are plain global classes. No cascade surprises expected. If one surfaces (e.g., a component's scoped style loses to a motif utility), escalate via `:where()` wrapping or explicit cascade layering.

**Rollback:**
- Each phase is one or more commits; revert the PR.
- The token repointing is the riskiest single change: if Foundations ships and someone discovers a broken surface, a single CSS revert restores the old palette without touching asset files.
- Asset files in `public/images/vaporwave-ui/` are additive — leaving them in place is harmless if a revert happens; remove in a follow-up cleanup.

## Rollout

### Phase 1 — Foundations PR

Ships site-wide dark vaporwave chrome + all ancillary surfaces + mobile re-palette + boot re-palette. Hero apps still have their old bodies inside the new window chrome (readable — just not yet bespoke).

Includes:
- All of §1 (tokens), §2 (typography roles), §3 (motif infra), §4 (base chrome), §6 (ancillary), §7 (mobile), §10 (accessibility), §8 (window-control icons + noise PNG).
- Per-app `<style>` audit for About/Projects/Resume/Uses/Flags/Mail/Trash.
- `Window.astro` JSX change (window-control `<img>` swap).
- Wallpaper swap if ready, else leave existing image and let the dark fallback show.

### Phase 2 — Hero apps PR

Ships §5 bespoke chrome for Terminal / Music / Memes / Photos. Four independent rewrites in one PR (each testable via opening that app). Includes:
- Music transport button PNGs.
- Deterministic-rotation helper for Memes polaroids.
- Media queries inside each hero component to handle mobile viewports.

### Phase 3 — Polish PR

Smaller cleanup pass:
- Wallpaper finalized if deferred in Phase 1.
- Any `<style>` audit misses from Phase 1.
- Clippy / flag-toast / reset-confirm tuning based on Phase 1 usage.
- Minor motif tuning (scanline opacity, grain mix-blend-mode, chromatic aberration offset) if needed.
- `CLAUDE.md` aesthetic conventions section — can also land in Phase 1, implementer's call.

## Open questions / implementer discretion

1. Exact pause/play button PNG pairing from the pack — the mockup used `vaporwave ui_button-07.png` for play; the implementer picks a complementary pause sprite of the implementer's choice within the same numbered range.
2. Whether to use the recolor script (if one exists in `scripts/` already) or hand-pick a new wallpaper. Either is fine; goal is "dark, vaporwave-toned, works as a dim backdrop, < 200 KB".
3. Whether `motif-grain` should also apply inside window bodies — the spec applies it at `<body>` level only. If it reduces body-text readability in practice, limit it to chrome surfaces via opt-in class.
4. Mobile hero-app layouts — the spec assumes the bespoke chrome degrades sensibly to narrow viewports. Any media query refinements discovered during testing land in Phase 2.
