# Clippy companion

**Status:** draft design, 2026-04-20
**Issue:** [#62](https://github.com/millsmillsymills/millsymills.com/issues/62) (paperclip swap from the original floppy spec — see Q1 in the brainstorm log)
**Tracks:** item 1 of [#95](https://github.com/millsmillsymills/millsymills.com/issues/95) (WinXp pack umbrella)

**Goal:** A corner-dwelling Clippy companion that animates through a curated set of XP-era poses, speaks contextual quips, and hides on dismiss. Closes #62.

## Why

Issue #62 specced "the Y2K Clippy we deserve" via a hand-rolled pixel floppy. The NullTale WinXp pack (#95) shipped 25 actual Clippy poses with sprite sheets — that's the real Office Assistant, not a stand-in. Wiring the genuine article fulfills the issue's intent more faithfully than the floppy substitute and saves the SVG-handcraft work.

## Design decisions (locked during brainstorming)

1. **Asset: Clippy (paperclip), not floppy.** The 25-pose pack closes #62 directly; floppy stays as a possible Easter-egg follow-up.
2. **Movement model: corner-dwelling, not cursor-following.** Pack poses are full-body animated frames built to play in place; dragging them around the screen looks broken. Less invasive than ambient cursor-tracking.
3. **Pose set: 8 curated poses, ~14 MB total** (vs 45 MB for the full set). Covers the trigger surface from #62 (boot/idle/flag/error/dismiss) plus personality moments without bloat.
4. **Bubbles + per-app variation.** Quips vary by current top-window context. Generic pool plus per-app overrides; the per-app surface is the whole point of the gag.
5. **Dismiss: confirmation popover with session/forever/cancel.** Persists in localStorage as `mills.clippy.dismissed`; the existing `reset.ts` flow clears `mills.*` keys, so "forever" is recoverable.
6. **11th CTF flag.** Click sprite 7× within 10 seconds → `flag{paperclip_was_a_lifestyle}`. Bumps the canonical "10 hidden flags" count, in the spirit of subverting the promise.
7. **Architecture: single Astro component + single TS controller + one quips data file.** Same shape as `window-manager`, `music`, `reset` — three files total.

## Scope

In:
- `src/components/desktop/Clippy.astro` (mount + scoped CSS).
- `src/scripts/clippy.ts` (state machine, triggers, animation tech, dismiss flow, flag click counter).
- `src/data/clippy-quips.ts` (per-app + default quip pools).
- 8 sprite sheet PNGs renamed and dropped into `public/clippy/`.
- One `<Clippy />` mount in `src/layouts/DesktopLayout.astro`.
- `src/scripts/flags.ts` — one new entry in the `challenges` array (`id: 'clippy'`, digest as below). Bumps total to 11.
- One CSS region scoped inside the `Clippy.astro` file (matches the existing pattern in `Photos.astro`, `Memes.astro`, etc.).
- `src/data/apps.ts` — `flags` app's `ogDescription` updated from "10 hidden CTF flags" → "11 hidden CTF flags" so the per-app OG metadata stays accurate.

Out (deliberate):
- Drag-and-drop of Clippy.
- Sound effects (#62 says "we'll regret it"; sounds get their own brainstorm under #95 item 4).
- Voice synthesis or typing animations for quips.
- Dynamic pose packs — the 17 unselected poses stay in `~/Downloads/assets/WinXp/Clip/sheets/`.
- Wallpaper picker, WinIcons sprite-sheet, Minesweeper Easter egg — separate items in #95.

## Architecture

### Asset layout — `public/clippy/`

8 sprite sheets, renamed kebab-case from the source's parens-and-spaces:

| File | Pose | Frames | Native sheet width | Approx file size |
|---|---|---|---|---|
| `idle.png` | idle (default loop) | 33 | 7920 × 240 | 1.1 MB |
| `wakeup.png` | wakeup (first show, undismiss) | 22 | 5280 × 240 | 0.8 MB |
| `leave.png` | leave (on dismiss confirm) | 13 | 3120 × 240 | 144 KB |
| `think.png` | think (idle 30s) | 55 | 13200 × 240 | 1.9 MB |
| `sleep.png` | sleep (idle 5m+) | 145 | 34800 × 240 | 4.2 MB |
| `cool.png` | cool (on flag captured) | 60 | 14400 × 240 | 1.7 MB |
| `tired.png` | tired (idle 2min, between think and sleep) | 133 | 31920 × 240 | 4.3 MB |
| `point-right.png` | point right (quip delivery) | 34 | 8160 × 240 | 1.0 MB |

**Total: ~14 MB.** All 240px tall; one frame = 240×240 square.

### Component — `src/components/desktop/Clippy.astro`

Mounted once from `src/layouts/DesktopLayout.astro` (after `<slot />`, alongside `<div class="boot-overlay">`). Markup:

```astro
<aside class="clippy" id="clippy" role="complementary" aria-label="clippy companion" hidden>
  <button type="button" class="clippy__sprite" data-clippy-pose="idle" aria-label="clippy"></button>
  <div class="clippy__bubble" hidden role="status" aria-live="polite">
    <span class="clippy__bubble-text"></span>
  </div>
  <div class="clippy__popover" hidden role="dialog" aria-label="hide clippy">
    <p>hide this thing?</p>
    <button type="button" data-clippy-dismiss="session">this session</button>
    <button type="button" data-clippy-dismiss="forever">forever</button>
    <button type="button" data-clippy-dismiss-cancel>cancel</button>
  </div>
</aside>
<script>import '../../scripts/clippy';</script>
```

CSS is scoped inside the component file (the existing pattern from `Photos.astro`, `Memes.astro`, etc.). Position: `fixed; right: 24px; bottom: 64px;` (above the 40px-tall `.taskbar` plus a small gap). Z-index: 200 (above `.window` z-stack which starts at 100; below the boot overlay's 9999). The `<button>` element is the sprite itself so click handling, focus ring, and keyboard activation are native.

### Controller — `src/scripts/clippy.ts`

Single file, ~250-350 lines. Top-level structure:

```ts
// Render guard — bail out before doing anything if we shouldn't render.
if (typeof window === 'undefined') /* SSR — bail */;
if (window.matchMedia('(hover: none)').matches) /* touch — bail */;
if (localStorage.getItem('mills.clippy.dismissed') === 'forever') /* user said no — bail */;

// Module-level state
type Pose = 'idle' | 'wakeup' | 'leave' | 'think' | 'sleep' | 'cool' | 'tired' | 'point-right';
const POSE_DURATIONS_MS: Record<Pose, number> = { idle: 2400, wakeup: 1500, leave: 800, think: 3500, sleep: 9000, cool: 3500, tired: 8000, 'point-right': 2200 };

let currentPose: Pose = 'idle';
let idleTimer: number | null = null;
let returnToIdleTimer: number | null = null;
let clickTimes: number[] = []; // for the 11th flag

// Lifecycle
function init() { /* idempotency guard, attach listeners, play wakeup, start idle timer */ }
function setPose(next: Pose) { /* update data-clippy-pose, schedule return to idle */ }
function speak(text: string, ms = 4000) { /* fill .clippy__bubble-text, show, hide after ms */ }
function pickQuipForCurrentContext(trigger: QuipTrigger): string { /* read top window, look up quips */ }

// Triggers
//  - on boot-overlay-removed event → setPose('wakeup') then setPose('idle')
//  - mousemove/click anywhere → resetIdleTimer()
//  - idle 30s  → setPose('think') + speak()
//  - idle 2m   → setPose('tired')
//  - idle 5m   → setPose('sleep')
//  - 'mills:flag-captured' (CustomEvent, existing) → setPose('cool') + speak()
//  - sprite click → register click timestamp; if within-popover-suppression window, do not open popover; if 7 clicks in 10s, captureById('clippy')
//  - sprite click outside the streak → openDismissPopover()
//  - dismiss button → persist mills.clippy.dismissed, setPose('leave'), then hide

// Idempotency guard mirrors the pattern from reset.ts (#67):
const w = window as unknown as { mills?: Record<string, unknown> & { __clippyInit?: true } };
if (w.mills?.__clippyInit) /* bail */; else { w.mills = { ...(w.mills ?? {}), __clippyInit: true }; init(); }
```

Reuses existing infrastructure:
- `mills:flag-captured` CustomEvent already fires from `flags.ts:198` on capture.
- `captureById('clippy')` is the standard capture path used by `konami` and `sudo`.
- `WindowManager` exposes the open-stack via `state.open` (last = top); controller reads top via DOM (`.taskbar-item--active` text or the highest-z `.window:not([hidden])`).
- No error-toast surface exists in the codebase today (only `.flag-toast-host` for capture announcements, which is success-flavored). The `tired` pose is therefore wired to the long-idle progression instead of an error trigger — see the trigger comments above.

### Quip data — `src/data/clippy-quips.ts`

```ts
export type QuipTrigger = 'idle' | 'flag' | 'wakeup';

export interface QuipBank {
  default: Partial<Record<QuipTrigger, string[]>>;
  perApp: Record<string, Partial<Record<QuipTrigger, string[]>>>;
}

export const quips: QuipBank = {
  default: {
    idle: ['i remember when this was 1.44 MB', 'format c: ?', 'please insert disk 2 of 47', 'i am still bigger than your terraform state', '<3 mills'],
    flag: ['nice find. very 1995 of you.', 'flag captured. this used to be a job.'],
    wakeup: ['hi! it looks like you are visiting a personal website.'],
  },
  perApp: {
    trash: { idle: ["don't put me in there"] },
    terminal: { idle: ['i could be a bootloader.'] },
    flags: { idle: ["there's one inside me. probably."] },
    memes: { idle: ['kilroy was here'] },
    music: { idle: ['ask jeeves what bops are bopping today'] },
    photos: { idle: ['cats. all the way down.'] },
    mail: { idle: ['it looks like you are sending mills mail.'] },
    resume: { idle: ['my resume is just one continuous spinning hourglass.'] },
    uses: { idle: ['the chimera. i too am chimeric.'] },
    projects: { idle: ['github used to be sourceforge used to be a directory of FTP links.'] },
    about: { idle: ['it looks like you are reading about mills.'] },
  },
};

export function pickQuip(appId: string | undefined, trigger: QuipTrigger): string {
  const appBank = appId ? quips.perApp[appId] : undefined;
  const pool = appBank?.[trigger] ?? quips.default[trigger] ?? [];
  return pool[Math.floor(Math.random() * pool.length)] ?? '';
}
```

About 50 lines including the lookup function. New quips can be added without touching the controller.

### Sprite animation tech

Each sheet is a horizontal strip. CSS variables let one shared `@keyframes` rule scrub all 8 poses, with per-pose rules supplying frame count + duration:

```css
.clippy__sprite {
  width: 160px;
  height: 160px;
  background-repeat: no-repeat;
  background-size: calc(160px * var(--frames)) 160px;
  border: none;
  padding: 0;
  cursor: var(--c-pointer);
  /* default state below; per-pose rules override */
}

.clippy__sprite[data-clippy-pose="idle"]        { --frames: 33;  background-image: url('/clippy/idle.png');        animation: clippy-scrub 2.4s steps(33) infinite; }
.clippy__sprite[data-clippy-pose="wakeup"]      { --frames: 22;  background-image: url('/clippy/wakeup.png');      animation: clippy-scrub 1.5s steps(22) 1 forwards; }
.clippy__sprite[data-clippy-pose="leave"]       { --frames: 13;  background-image: url('/clippy/leave.png');       animation: clippy-scrub 0.8s steps(13) 1 forwards; }
.clippy__sprite[data-clippy-pose="think"]       { --frames: 55;  background-image: url('/clippy/think.png');       animation: clippy-scrub 3.5s steps(55) 1 forwards; }
.clippy__sprite[data-clippy-pose="sleep"]       { --frames: 145; background-image: url('/clippy/sleep.png');       animation: clippy-scrub 9s   steps(145) 1 forwards; }
.clippy__sprite[data-clippy-pose="cool"]        { --frames: 60;  background-image: url('/clippy/cool.png');        animation: clippy-scrub 3.5s steps(60) 1 forwards; }
.clippy__sprite[data-clippy-pose="tired"]       { --frames: 133; background-image: url('/clippy/tired.png');       animation: clippy-scrub 8s   steps(133) 1 forwards; }
.clippy__sprite[data-clippy-pose="point-right"] { --frames: 34;  background-image: url('/clippy/point-right.png'); animation: clippy-scrub 2.2s steps(34) 1 forwards; }

@keyframes clippy-scrub {
  from { background-position: 0 0; }
  to   { background-position: calc(-160px * var(--frames)) 0; }
}
```

Display size 160×160 (scaled 2/3 from 240px native). Non-idle poses run once and stop on the last frame; the controller swaps `data-clippy-pose` back to `idle` via `setTimeout` keyed off `POSE_DURATIONS_MS`.

### CTF flag (11th) — `src/scripts/flags.ts` + `src/data/apps.ts`

Add one entry to the `challenges` array:

```ts
{
  id: 'clippy',
  title: 'office space',
  hint: 'click vigorously on the helpful one in the corner',
  difficulty: 'easy',
  digest: '7c4472a13cd7a2ab2b8bc08de2a7f294bd45989da767b07149546f04d4c0ea9d', // SHA-256 of "flag{paperclip_was_a_lifestyle}"
  tag: 'delight',
},
```

The clippy controller calls `captureById('clippy')` (existing helper at `flags.ts:186`) when the 7-clicks-in-10s condition fires. The flag count rendered in `Flags.astro` (`{challenges.length}`) updates automatically.

`src/data/apps.ts` line 70 currently advertises "10 hidden CTF flags" in the `flags` app's `ogDescription`. Update to "11 hidden CTF flags" so the per-app OG image renders the right count.

The popover-suppression rule: while a click streak is active (>=2 clicks in the last 10s window), the dismiss popover is suppressed. After the 10s window expires without 7 hits, a single subsequent click opens the popover normally. This avoids the popover stealing focus mid-streak and making the flag uncapturable.

### Accessibility

- `aside.clippy` carries `role="complementary"` and `aria-label="clippy companion"`.
- Sprite is a real `<button>` so keyboard focus, Enter/Space activation, and focus ring all work natively.
- `.clippy__bubble` has `role="status" aria-live="polite"` so screen readers announce quips.
- `.clippy__popover` has `role="dialog" aria-label="hide clippy"`. ESC closes it. Focus trap not needed (small, three-button popover); first dismiss-button receives focus on open.
- Per-pose alt text for the screen reader is unnecessary (decorative animation; the bubble carries the meaning).

### Mobile + reduced motion

```css
@media (hover: none) {
  .clippy { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .clippy__sprite { animation: none; background-position: 0 0; }
}
```

Touch hide is also enforced in the controller's render guard (`matchMedia('(hover: none)').matches` → bail before mounting listeners). Reduced motion: sprite still appears, controller still updates `data-clippy-pose` (so pose conceptually changes), but each pose renders as its first frame — no scrubbing.

## Data flow

```
boot.ts adds 'boot-overlay--done' class
  → dispatches CustomEvent('mills:boot-done')        (controller listens)
  → controller plays wakeup → idle, starts idle timer

DOM-level mousemove/click → controller resets idle timer

idle timer 30s   → setPose('think') + speak(pickQuip(currentApp, 'idle'))
idle timer 2min  → setPose('tired')
idle timer 5min  → setPose('sleep')
idle timers cancelled on next mousemove/click; pose returns to idle on user activity

flags.ts dispatches 'mills:flag-captured'
  → controller plays cool + speak(pickQuip(currentApp, 'flag'))

sprite click
  → push timestamp; if last 7 within 10s → captureById('clippy') and bail
  → else if streak active (≥2 clicks in last 10s) → no-op
  → else → open dismiss popover

dismiss popover button click
  → persist mills.clippy.dismissed = 'session' | 'forever'
  → setPose('leave'), then setTimeout to hide aside
```

`mills:boot-done` is a NEW event the controller depends on. `boot.ts` currently adds a `boot-overlay--done` class to the overlay element when boot finishes; this spec adds one line dispatching the CustomEvent at that point. Trivial.

## Error handling

- Sprite-sheet fails to load → CSS background-image silently falls through; the `<button>` remains a 160×160 transparent box. No JS error. User-visible degradation: invisible Clippy. Logged via the dev-server 404 — same behavior as other public-asset failures (#63 historical pattern).
- localStorage disabled → guard throws; controller catches and treats dismiss state as "not dismissed." Quips and animations still work; dismiss is single-session by accident.
- The `mills:flag-captured` event payload — controller doesn't need it; it just plays `cool`. If the payload shape changes, this code still works.

## Risks

- **Bundle size.** ~14 MB of sprite sheets ship with every visitor. CDN cost is minor (sheets are cacheable and only loaded on `.desktop` pages). On first paint only `idle.png` (1.1 MB) is needed; others fetch lazily as poses fire. All eight should set `loading="eager"` only via `<link rel=preload>` if we care about pre-pose latency — for now we don't preload.
- **Focus stealing.** The popover opening near the corner could steal focus from a window the user was typing in. Mitigation: popover only opens on explicit sprite click; sprite click is a deliberate user action.
- **Click-streak vs popover race.** Documented in CTF flag section — popover is suppressed while a 10s streak window is active. Edge case: user clicks 6 times then forgets, walks away, returns 9.99s later, clicks once more — this fires the flag instead of the popover. Acceptable; user can dismiss after via the next click.
- **Reduced-motion sprite as static image.** The sprite sheet's first frame may not be the most visually-meaningful frame (some poses begin mid-action). Acceptable cost for the option.

## Testing

- `npx astro check` clean.
- Dev smoke checklist (manual):
  - Boot the desktop. Clippy wakes up bottom-right then idles.
  - Leave cursor alone 30s → Clippy `think`s and speaks.
  - Leave 5min → `sleep` (cancelled by next interaction).
  - Capture a flag via devtools (`window.mills.capture('view-source')`) → Clippy `cool`s + speaks.
  - Leave 2min → Clippy `tired`s, returns to idle.
  - Click Clippy 7× in 10s → flag captured (toast: "office space").
  - Click Clippy once → dismiss popover; click "this session" → leave + hide; reload → Clippy returns.
  - Click "forever" → leave + hide; reload → still hidden. Run `mills.reset()` → Clippy returns.
  - DevTools mobile-emulate (touch) → Clippy never appears.
  - DevTools `prefers-reduced-motion: reduce` → Clippy appears, no animation, single frame per pose.
- No unit tests (consistent with `src/scripts/`'s no-test status; controller is DOM-driven).

## Implementation sequencing

1. **Asset prep.** Copy + rename the 8 sprite sheets into `public/clippy/`. Verify size budget.
2. **Quip data.** Create `src/data/clippy-quips.ts` with the lookup function.
3. **Component.** Create `src/components/desktop/Clippy.astro` with markup + scoped CSS.
4. **Controller — render guard + bare init.** Mount the sprite, run idle animation, no triggers. Verify visual.
5. **Controller — pose state machine + setPose.** All 8 poses cyclable via devtools.
6. **Controller — triggers (one at a time):** boot-done, mousemove idle, flag-captured, error toast, click → popover.
7. **Boot integration.** Add `mills:boot-done` CustomEvent dispatch in `boot.ts`.
8. **CTF flag.** Add `clippy` entry to `flags.ts`; controller wires the 7-click counter.
9. **Mount.** Add `<Clippy />` to `DesktopLayout.astro`.
10. **Verification.** astro check, dev smoke checklist above, build, dist inspection.
11. **PR.** Open against main, reference #62 and #95.
