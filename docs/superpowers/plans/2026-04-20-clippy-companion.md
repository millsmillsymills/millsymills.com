# Clippy Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a corner-dwelling Clippy desktop companion: 8 animated poses, contextual quip bubbles, click-to-dismiss popover with session/forever persistence, plus an 11th CTF flag that fires on a 7-click streak.

**Architecture:** Single Astro component (`Clippy.astro`) holds the markup + scoped CSS for the sprite, bubble, and popover. Single TS controller (`clippy.ts`) drives the pose state machine, idle timers, dismiss flow, and click-streak counter. One quip data file (`clippy-quips.ts`) supplies per-app quip pools. Sprite sheets are horizontal strips (240px tall) animated via CSS `step()` with frame counts in CSS variables. Mounted once from `DesktopLayout.astro`.

**Tech Stack:** Astro 6 (static), TypeScript, plain CSS, native CustomEvent.

**Spec:** `docs/superpowers/specs/2026-04-20-clippy-companion-design.md`
**Issue:** [#62](https://github.com/millsmillsymills/millsymills.com/issues/62), tracks item 1 of [#95](https://github.com/millsmillsymills/millsymills.com/issues/95)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `public/clippy/{idle,wakeup,leave,think,sleep,cool,tired,point-right}.png` | create | 8 sprite sheets, kebab-case |
| `src/data/clippy-quips.ts` | create | Per-app + default quip pools, `pickQuip()` lookup |
| `src/data/apps.ts` | modify (1 line) | Bump `flags` app's `ogDescription` from "10" to "11" |
| `src/scripts/flags.ts` | modify (~10 lines) | Add `clippy` entry to `challenges` array |
| `src/scripts/boot.ts` | modify (1 line) | Dispatch `mills:boot-done` CustomEvent on overlay-done |
| `src/components/desktop/Clippy.astro` | create | Aside markup + scoped CSS for sprite/bubble/popover |
| `src/scripts/clippy.ts` | create | Controller — pose state machine, triggers, dismiss, click-streak |
| `src/layouts/DesktopLayout.astro` | modify (2 lines) | Import + mount `<Clippy />` once |

No tests added — `src/scripts/` has no test scaffolding today, and the controller is DOM-driven; verification happens via dev-server smoke (Task 11).

---

## Task 0: Pre-flight — verify source assets exist

This branch was cut from `main`. Sprite-sheet sources live in `~/Downloads/assets/WinXp/Clip/sheets/`. Before doing rendering work, confirm the 8 source files exist and the SHA-256 of the canonical flag string matches the digest the spec quotes.

**Files:** none modified.

- [ ] **Step 1: Verify the 8 sprite-sheet source files exist with the expected dimensions**

```bash
cd ~/Downloads/assets/WinXp/Clip/sheets && for p in idle wakeup leave think sleep cool tired 'point right'; do
  f="clip ($p)_sheet.png"
  if [ ! -f "$f" ]; then echo "MISSING $f"; exit 1; fi
  w=$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$f" 2>/dev/null | awk '/pixelHeight/ {print $2}')
  printf '%-15s %d frames (%dx%d)\n' "$p" $((w/240)) "$w" "$h"
done
```

Expected output (frame counts in particular):
```
idle              33 frames (7920x240)
wakeup            22 frames (5280x240)
leave             13 frames (3120x240)
think             55 frames (13200x240)
sleep            145 frames (34800x240)
cool              60 frames (14400x240)
tired            133 frames (31920x240)
point right       34 frames (8160x240)
```

If frame counts differ, STOP — the CSS animation durations in Task 6 are pinned to these counts.

- [ ] **Step 2: Verify the SHA-256 digest used in Task 4 matches the canonical flag string**

```bash
printf 'flag{paperclip_was_a_lifestyle}' | shasum -a 256 | awk '{print $1}'
```

Expected: `7c4472a13cd7a2ab2b8bc08de2a7f294bd45989da767b07149546f04d4c0ea9d`

If this doesn't match, the flag will never validate. Stop and re-derive.

---

## Task 1: Drop sprite-sheet assets into `public/clippy/`

**Files:**
- Create: `public/clippy/idle.png`, `wakeup.png`, `leave.png`, `think.png`, `sleep.png`, `cool.png`, `tired.png`, `point-right.png`

- [ ] **Step 1: Make the destination directory**

```bash
mkdir -p public/clippy
```

- [ ] **Step 2: Copy + rename the 8 sheets (parens-and-spaces → kebab-case)**

```bash
SRC=~/Downloads/assets/WinXp/Clip/sheets
cp "$SRC/clip (idle)_sheet.png"        public/clippy/idle.png
cp "$SRC/clip (wakeup)_sheet.png"      public/clippy/wakeup.png
cp "$SRC/clip (leave)_sheet.png"       public/clippy/leave.png
cp "$SRC/clip (think)_sheet.png"       public/clippy/think.png
cp "$SRC/clip (sleep)_sheet.png"       public/clippy/sleep.png
cp "$SRC/clip (cool)_sheet.png"        public/clippy/cool.png
cp "$SRC/clip (tired)_sheet.png"       public/clippy/tired.png
cp "$SRC/clip (point right)_sheet.png" public/clippy/point-right.png
ls -1 public/clippy/
```

Expected: 8 PNG filenames listed.

- [ ] **Step 3: Sanity-check size budget**

```bash
du -sh public/clippy
```

Expected: ~14 MB total.

- [ ] **Step 4: Commit**

```bash
git add public/clippy/
git commit -m "feat(clippy): drop 8 curated sprite sheets into public/clippy (#62, #95)"
```

---

## Task 2: Create the quip data file

**Files:**
- Create: `src/data/clippy-quips.ts`

- [ ] **Step 1: Write `src/data/clippy-quips.ts`**

Full file content:

```ts
// Per-app + default Clippy quips. The controller calls pickQuip(appId, trigger)
// to get a contextual line — falls back to the default pool if the current app
// has no override for that trigger.
//
// Add a new entry here when wiring a new app or trigger; no controller change
// required.

export type QuipTrigger = 'idle' | 'flag' | 'wakeup';

export interface QuipBank {
	default: Partial<Record<QuipTrigger, string[]>>;
	perApp: Record<string, Partial<Record<QuipTrigger, string[]>>>;
}

export const quips: QuipBank = {
	default: {
		idle: [
			'i remember when this was 1.44 MB',
			'format c: ?',
			'please insert disk 2 of 47',
			'i am still bigger than your terraform state',
			'<3 mills',
		],
		flag: [
			'nice find. very 1995 of you.',
			'flag captured. this used to be a job.',
		],
		wakeup: [
			'hi! it looks like you are visiting a personal website.',
		],
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
	if (pool.length === 0) return '';
	return pool[Math.floor(Math.random() * pool.length)];
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npx astro check
```

Expected: `0 errors`, `0 warnings`, `0 hints`.

- [ ] **Step 3: Commit**

```bash
git add src/data/clippy-quips.ts
git commit -m "feat(clippy): per-app quip pools + pickQuip lookup (#62)"
```

---

## Task 3: Add the 11th flag entry + bump apps.ts ogDescription

**Files:**
- Modify: `src/scripts/flags.ts`
- Modify: `src/data/apps.ts`

- [ ] **Step 1: Add the `clippy` entry to the `challenges` array in `src/scripts/flags.ts`**

Find the closing `]` of the `challenges` array (around line 107 — after the `base64` entry). Insert the new entry as the last array element:

```ts
	{
		id: 'clippy',
		title: 'office space',
		hint: 'click vigorously on the helpful one in the corner',
		difficulty: 'easy',
		digest: '7c4472a13cd7a2ab2b8bc08de2a7f294bd45989da767b07149546f04d4c0ea9d',
		tag: 'delight',
	},
```

The array now has 11 entries.

- [ ] **Step 2: Bump `flags` app's `ogDescription` in `src/data/apps.ts`**

Find (around line 70):

```ts
		ogDescription: '10 hidden CTF flags scattered across the site. find them all. Juice-Shop-style.',
```

Replace with:

```ts
		ogDescription: '11 hidden CTF flags scattered across the site. find them all. Juice-Shop-style.',
```

- [ ] **Step 3: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 4: Verify the digest one more time before committing**

```bash
printf 'flag{paperclip_was_a_lifestyle}' | shasum -a 256 | awk '{print $1}'
```

Expected: matches the digest pasted in Step 1 (`7c4472a1...c0ea9d`).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/flags.ts src/data/apps.ts
git commit -m "feat(flags): add 11th clippy flag + bump flags app ogDescription (#62)"
```

---

## Task 4: Dispatch `mills:boot-done` CustomEvent in `boot.ts`

**Files:**
- Modify: `src/scripts/boot.ts`

- [ ] **Step 1: Find the line that adds `boot-overlay--done` class**

Run:
```bash
grep -n 'boot-overlay--done' src/scripts/boot.ts
```

Expected: a line like `overlay.classList.add('boot-overlay--done');` near line 45.

- [ ] **Step 2: Add a CustomEvent dispatch immediately after that line**

The block before edit looks like (in context):
```ts
		overlay.classList.add('boot-overlay--done');
```

Replace with:
```ts
		overlay.classList.add('boot-overlay--done');
		// Notify subscribers (e.g. Clippy) that the boot animation is finished
		// and the desktop is interactive.
		window.dispatchEvent(new CustomEvent('mills:boot-done'));
```

- [ ] **Step 3: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/boot.ts
git commit -m "feat(boot): dispatch mills:boot-done CustomEvent after overlay finishes (#62)"
```

---

## Task 5: Create `Clippy.astro` component + controller stub + mount

This task creates three files together so that subsequent controller tasks have a working render target. The controller starts as an empty stub; tasks 6-9 grow it.

**Files:**
- Create: `src/components/desktop/Clippy.astro`
- Create: `src/scripts/clippy.ts` (stub)
- Modify: `src/layouts/DesktopLayout.astro`

- [ ] **Step 1: Write `src/scripts/clippy.ts` as an empty stub**

```ts
// Clippy companion controller. See src/components/desktop/Clippy.astro for
// markup + CSS, and docs/superpowers/specs/2026-04-20-clippy-companion-design.md
// for the full design.
//
// Stub for now — fills in over Tasks 6-9 of the implementation plan.

export {};
```

- [ ] **Step 2: Write `src/components/desktop/Clippy.astro`**

Full file content:

```astro
---
// Clippy desktop companion — corner-dwelling animated paperclip. Markup +
// scoped CSS only; behavior lives in src/scripts/clippy.ts.
---

<aside
	class="clippy"
	id="clippy"
	role="complementary"
	aria-label="clippy companion"
	hidden
>
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

<style>
	.clippy {
		position: fixed;
		right: 24px;
		bottom: 64px;
		z-index: 200;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		font-family: var(--font-screen);
	}

	.clippy[hidden] {
		display: none;
	}

	.clippy__sprite {
		all: unset;
		width: 160px;
		height: 160px;
		background-repeat: no-repeat;
		background-size: calc(160px * var(--frames, 1)) 160px;
		cursor: var(--c-pointer);
	}

	.clippy__sprite:focus-visible {
		outline: 2px dashed var(--cream);
		outline-offset: 2px;
	}

	.clippy__sprite[data-clippy-pose='idle']        { --frames: 33;  background-image: url('/clippy/idle.png');        animation: clippy-scrub 2.4s steps(33) infinite; }
	.clippy__sprite[data-clippy-pose='wakeup']      { --frames: 22;  background-image: url('/clippy/wakeup.png');      animation: clippy-scrub 1.5s steps(22) 1 forwards; }
	.clippy__sprite[data-clippy-pose='leave']       { --frames: 13;  background-image: url('/clippy/leave.png');       animation: clippy-scrub 0.8s steps(13) 1 forwards; }
	.clippy__sprite[data-clippy-pose='think']       { --frames: 55;  background-image: url('/clippy/think.png');       animation: clippy-scrub 3.5s steps(55) 1 forwards; }
	.clippy__sprite[data-clippy-pose='sleep']       { --frames: 145; background-image: url('/clippy/sleep.png');       animation: clippy-scrub 9s   steps(145) 1 forwards; }
	.clippy__sprite[data-clippy-pose='cool']        { --frames: 60;  background-image: url('/clippy/cool.png');        animation: clippy-scrub 3.5s steps(60) 1 forwards; }
	.clippy__sprite[data-clippy-pose='tired']       { --frames: 133; background-image: url('/clippy/tired.png');       animation: clippy-scrub 8s   steps(133) 1 forwards; }
	.clippy__sprite[data-clippy-pose='point-right'] { --frames: 34;  background-image: url('/clippy/point-right.png'); animation: clippy-scrub 2.2s steps(34) 1 forwards; }

	@keyframes clippy-scrub {
		from { background-position: 0 0; }
		to   { background-position: calc(-160px * var(--frames)) 0; }
	}

	.clippy__bubble {
		max-width: 200px;
		padding: 8px 10px;
		background: var(--cream);
		color: var(--ink);
		border: 2px solid var(--border);
		border-radius: 8px;
		box-shadow: 2px 2px 0 0 var(--border);
		font-family: var(--font-screen);
		font-size: 16px;
		line-height: 1.25;
	}

	.clippy__bubble[hidden] {
		display: none;
	}

	.clippy__popover {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		background: var(--cream);
		color: var(--ink);
		border: 2px solid var(--border);
		border-radius: 8px;
		box-shadow: 2px 2px 0 0 var(--border);
		font-family: var(--font-screen);
		font-size: 14px;
	}

	.clippy__popover[hidden] {
		display: none;
	}

	.clippy__popover p {
		margin: 0 0 4px;
	}

	.clippy__popover button {
		all: unset;
		cursor: var(--c-pointer);
		padding: 4px 8px;
		background: var(--pink-100);
		border: 2px solid var(--border);
		border-radius: 4px;
		font-family: var(--font-pixel);
		font-size: 10px;
		text-align: center;
	}

	.clippy__popover button:hover,
	.clippy__popover button:focus-visible {
		background: var(--pink-200);
	}

	@media (hover: none) {
		.clippy { display: none; }
	}

	@media (prefers-reduced-motion: reduce) {
		.clippy__sprite { animation: none !important; background-position: 0 0; }
	}
</style>

<script>
	import '../../scripts/clippy';
</script>
```

- [ ] **Step 3: Mount `<Clippy />` in `src/layouts/DesktopLayout.astro`**

Add the import alongside the other component imports near the top of the frontmatter (after `import { profile } from '../data/profile';` is a natural spot):

```astro
import Clippy from '../components/desktop/Clippy.astro';
```

Find the existing `<slot />` block (around line 92, immediately before `<div class="boot-overlay">`):

```astro
		<slot />
		<div class="boot-overlay" aria-hidden="true"></div>
```

Replace with:

```astro
		<slot />
		<Clippy />
		<div class="boot-overlay" aria-hidden="true"></div>
```

- [ ] **Step 4: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 5: Visual smoke (optional during dev)**

Start the dev server (or rely on the running one) and load `http://localhost:4321/`. The Clippy aside is rendered with `hidden` so nothing visible appears yet — you should see no visual change. Open DevTools, find `<aside id="clippy" hidden>`, and temporarily remove the `hidden` attribute. Expected: the idle Clippy sprite renders bottom-right at 160×160 with the looping animation. Restore the `hidden` attribute when done.

- [ ] **Step 6: Commit**

```bash
git add src/components/desktop/Clippy.astro src/scripts/clippy.ts src/layouts/DesktopLayout.astro
git commit -m "feat(clippy): aside markup + scoped CSS + mount in DesktopLayout (#62)"
```

---

## Task 6: Controller — render guards, init, boot trigger

Make Clippy actually appear after the boot animation. No pose state machine yet — relies on the CSS `infinite` idle loop. Adds the dismiss popover wiring scaffolding (without the click-streak suppression that comes in Task 9).

**Files:**
- Modify: `src/scripts/clippy.ts` (replace stub with full skeleton)

- [ ] **Step 1: Replace `src/scripts/clippy.ts` with the controller skeleton**

```ts
// Clippy companion controller. See src/components/desktop/Clippy.astro for
// markup + CSS, and docs/superpowers/specs/2026-04-20-clippy-companion-design.md
// for the full design.

import { pickQuip } from '../data/clippy-quips';
import { captureById } from './flags';

type Pose =
	| 'idle'
	| 'wakeup'
	| 'leave'
	| 'think'
	| 'sleep'
	| 'cool'
	| 'tired'
	| 'point-right';

const POSE_DURATIONS_MS: Record<Pose, number> = {
	idle: 2400,
	wakeup: 1500,
	leave: 800,
	think: 3500,
	sleep: 9000,
	cool: 3500,
	tired: 8000,
	'point-right': 2200,
};

const IDLE_THINK_MS = 30_000;
const IDLE_TIRED_MS = 120_000;
const IDLE_SLEEP_MS = 300_000;
const QUIP_VISIBLE_MS = 4000;
const CLICK_STREAK_WINDOW_MS = 10_000;
const CLICK_STREAK_THRESHOLD = 7;
const STORAGE_KEY = 'mills.clippy.dismissed';

let aside: HTMLElement | null = null;
let sprite: HTMLButtonElement | null = null;
let bubble: HTMLElement | null = null;
let bubbleText: HTMLElement | null = null;
let popover: HTMLElement | null = null;

function init(): void {
	// Idempotency guard — match the pattern from reset.ts (#67).
	const w = window as unknown as {
		mills?: Record<string, unknown> & { __clippyInit?: true };
	};
	if (w.mills?.__clippyInit) return;

	// Render guards.
	if (window.matchMedia('(hover: none)').matches) return;
	try {
		if (localStorage.getItem(STORAGE_KEY) === 'forever') return;
	} catch {
		// localStorage disabled — proceed anyway; dismiss becomes session-only.
	}

	// Find DOM nodes.
	aside = document.getElementById('clippy');
	sprite = aside?.querySelector<HTMLButtonElement>('.clippy__sprite') ?? null;
	bubble = aside?.querySelector<HTMLElement>('.clippy__bubble') ?? null;
	bubbleText = aside?.querySelector<HTMLElement>('.clippy__bubble-text') ?? null;
	popover = aside?.querySelector<HTMLElement>('.clippy__popover') ?? null;
	if (!aside || !sprite || !bubble || !bubbleText || !popover) return;

	// Boot trigger — show Clippy once boot animation finishes.
	window.addEventListener('mills:boot-done', () => {
		if (!aside) return;
		aside.hidden = false;
	});

	w.mills = { ...(w.mills ?? {}), __clippyInit: true };
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

// Touch the imports to keep the linter from flagging them — they're consumed
// in Tasks 7-9.
void pickQuip;
void captureById;
void POSE_DURATIONS_MS;
void IDLE_THINK_MS;
void IDLE_TIRED_MS;
void IDLE_SLEEP_MS;
void QUIP_VISIBLE_MS;
void CLICK_STREAK_WINDOW_MS;
void CLICK_STREAK_THRESHOLD;
```

(The `void X` block at the bottom is a temporary measure — Tasks 7-9 use these symbols and the lines get deleted as each is wired up.)

- [ ] **Step 2: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 3: Dev-server smoke**

Reload `http://localhost:4321/`. After the boot animation finishes (a few seconds), Clippy should appear bottom-right and play the looping idle animation. If it doesn't:
- Check the dev-server log for 404s on `/clippy/*.png`.
- Open DevTools console, look for `mills:boot-done` event firing (you can listen with `addEventListener('mills:boot-done', () => console.log('boot done'))`).
- Confirm `<aside id="clippy">` no longer has the `hidden` attribute after the event fires.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/clippy.ts
git commit -m "feat(clippy): controller skeleton — render guards, boot trigger (#62)"
```

---

## Task 7: Controller — pose state machine + speak() + idle ladder

Adds `setPose`, `speak`, idle timers (`think` → `tired` → `sleep`), and the `mills:flag-captured` listener so capturing a flag triggers the `cool` pose with a quip.

**Files:**
- Modify: `src/scripts/clippy.ts`

- [ ] **Step 1: Add module-level state for the state machine**

Below the `let popover: HTMLElement | null = null;` line, add:

```ts
let currentPose: Pose = 'idle';
let returnToIdleTimer: number | null = null;
let bubbleHideTimer: number | null = null;
let idleThinkTimer: number | null = null;
let idleTiredTimer: number | null = null;
let idleSleepTimer: number | null = null;

function clearTimer(id: number | null): void {
	if (id !== null) window.clearTimeout(id);
}

function getCurrentAppId(): string | undefined {
	// Heuristic: the topmost open window in the desktop's z-stack is the
	// "current" app for quip context. Falls back to undefined (default pool)
	// when no windows are open.
	const visible = Array.from(
		document.querySelectorAll<HTMLElement>('.window:not([hidden])'),
	).sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
	return visible[0]?.dataset.windowId;
}

function setPose(next: Pose): void {
	if (!sprite) return;
	currentPose = next;
	sprite.dataset.clippyPose = next;
	clearTimer(returnToIdleTimer);
	// Non-loop poses auto-return to idle after their duration. idle and sleep
	// loop / hold and stay until something else fires.
	if (next !== 'idle' && next !== 'sleep') {
		returnToIdleTimer = window.setTimeout(() => {
			if (currentPose === next) setPose('idle');
		}, POSE_DURATIONS_MS[next]);
	}
}

function speak(text: string): void {
	if (!bubble || !bubbleText || !text) return;
	bubbleText.textContent = text;
	bubble.hidden = false;
	clearTimer(bubbleHideTimer);
	bubbleHideTimer = window.setTimeout(() => {
		if (bubble) bubble.hidden = true;
	}, QUIP_VISIBLE_MS);
}

function resetIdleTimers(): void {
	clearTimer(idleThinkTimer);
	clearTimer(idleTiredTimer);
	clearTimer(idleSleepTimer);
	// If Clippy was thinking / tired / sleeping, snap back to idle on activity.
	if (
		currentPose === 'think' ||
		currentPose === 'tired' ||
		currentPose === 'sleep'
	) {
		setPose('idle');
	}
	idleThinkTimer = window.setTimeout(() => {
		setPose('think');
		speak(pickQuip(getCurrentAppId(), 'idle'));
	}, IDLE_THINK_MS);
	idleTiredTimer = window.setTimeout(() => setPose('tired'), IDLE_TIRED_MS);
	idleSleepTimer = window.setTimeout(() => setPose('sleep'), IDLE_SLEEP_MS);
}
```

- [ ] **Step 2: Wire the boot trigger to play wakeup + start idle timers, and add the flag-captured listener**

Replace the existing boot trigger block (added in Task 6):

```ts
	// Boot trigger — show Clippy once boot animation finishes.
	window.addEventListener('mills:boot-done', () => {
		if (!aside) return;
		aside.hidden = false;
	});
```

…with:

```ts
	// Boot trigger — show Clippy, play wakeup, then start the idle ladder.
	window.addEventListener('mills:boot-done', () => {
		if (!aside) return;
		aside.hidden = false;
		setPose('wakeup');
		window.setTimeout(() => {
			speak(pickQuip(undefined, 'wakeup'));
		}, POSE_DURATIONS_MS.wakeup);
		resetIdleTimers();
	});

	// Activity resets the idle ladder.
	document.addEventListener('mousemove', resetIdleTimers, { passive: true });
	document.addEventListener('click', resetIdleTimers);

	// Flag captured anywhere → cool pose + contextual quip.
	window.addEventListener('mills:flag-captured', () => {
		setPose('cool');
		speak(pickQuip(getCurrentAppId(), 'flag'));
	});
```

- [ ] **Step 3: Remove the `void` lint-suppress lines that no longer apply**

Find and remove:

```ts
void pickQuip;
void POSE_DURATIONS_MS;
void IDLE_THINK_MS;
void IDLE_TIRED_MS;
void IDLE_SLEEP_MS;
void QUIP_VISIBLE_MS;
```

(Keep `void captureById;`, `void CLICK_STREAK_WINDOW_MS;`, `void CLICK_STREAK_THRESHOLD;` — those are wired up in Task 9.)

- [ ] **Step 4: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 5: Dev-server smoke**

Reload the desktop. Verify in order:
- After the boot animation, Clippy plays `wakeup` (one-shot animation), then settles into looping `idle`. A bubble appears with a wakeup quip.
- Leave the cursor still for 30s — Clippy plays `think` (one-shot), bubble shows an idle quip. Pose returns to `idle` after ~3.5s.
- Capture a flag from the devtools console: `window.dispatchEvent(new CustomEvent('mills:flag-captured', { detail: { id: 'view-source' } }))`. Clippy should play `cool` with a flag quip.
- (Long check, optional) Leave still for 2 minutes → `tired` plays. 5 minutes → `sleep` plays and stays.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/clippy.ts
git commit -m "feat(clippy): pose state machine + idle ladder + flag-captured trigger (#62)"
```

---

## Task 8: Controller — dismiss popover

Adds the click-handler that opens the dismiss popover, wires the three popover buttons, and persists the choice in `localStorage`. ESC closes the popover. Click-streak suppression for the CTF flag is NOT here — it lands in Task 9.

**Files:**
- Modify: `src/scripts/clippy.ts`

- [ ] **Step 1: Add the dismiss helper functions before `init()`**

Insert immediately after the `resetIdleTimers()` function from Task 7:

```ts
function openDismissPopover(): void {
	if (!popover) return;
	popover.hidden = false;
	popover.querySelector<HTMLButtonElement>('button')?.focus();
}

function closeDismissPopover(): void {
	if (popover) popover.hidden = true;
}

function dismiss(scope: 'session' | 'forever'): void {
	closeDismissPopover();
	setPose('leave');
	if (scope === 'forever') {
		try {
			localStorage.setItem(STORAGE_KEY, 'forever');
		} catch {
			// localStorage disabled — silently fall back to session-only.
		}
	}
	// After the leave animation finishes, hide the aside entirely.
	window.setTimeout(() => {
		if (aside) aside.hidden = true;
	}, POSE_DURATIONS_MS.leave);
}
```

- [ ] **Step 2: Wire the popover buttons + sprite click + ESC handler in `init()`**

Inside the `init()` function, after the `mills:flag-captured` listener block, add:

```ts
	// Sprite click → open dismiss popover. (Click-streak suppression for the
	// CTF flag is layered on in Task 9.)
	sprite.addEventListener('click', openDismissPopover);

	// Popover button wiring.
	popover
		.querySelector<HTMLButtonElement>('[data-clippy-dismiss="session"]')
		?.addEventListener('click', () => dismiss('session'));
	popover
		.querySelector<HTMLButtonElement>('[data-clippy-dismiss="forever"]')
		?.addEventListener('click', () => dismiss('forever'));
	popover
		.querySelector<HTMLButtonElement>('[data-clippy-dismiss-cancel]')
		?.addEventListener('click', closeDismissPopover);

	// ESC closes the popover.
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && popover && !popover.hidden) {
			closeDismissPopover();
		}
	});
```

- [ ] **Step 3: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 4: Dev-server smoke**

Reload the desktop. Verify:
- Click Clippy → popover appears with "this session" / "forever" / "cancel" buttons; first button is focused.
- Click "cancel" → popover closes; Clippy stays.
- Click "this session" → Clippy plays `leave`, then disappears. Reload the page → Clippy returns. (Session = no localStorage write.)
- Click "forever" → Clippy plays `leave`, then disappears. Reload → Clippy stays gone.
- Restore via devtools: `localStorage.removeItem('mills.clippy.dismissed')`, reload → Clippy returns.
- Open the popover, press ESC → popover closes.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/clippy.ts
git commit -m "feat(clippy): dismiss popover with session/forever persistence (#62)"
```

---

## Task 9: Controller — CTF click streak (11th flag) + popover suppression

Adds the click-streak counter so 7 sprite clicks within 10s captures `flag{paperclip_was_a_lifestyle}`. Suppresses the dismiss popover while a streak is active so it doesn't interrupt the user's clicking.

**Files:**
- Modify: `src/scripts/clippy.ts`

- [ ] **Step 1: Add a module-level click-times array**

Below the existing `let idleSleepTimer: number | null = null;` line (added in Task 7), add:

```ts
let clickTimes: number[] = [];
```

- [ ] **Step 2: Replace the simple sprite click handler with the streak-aware version**

In Task 8 you wrote:

```ts
	// Sprite click → open dismiss popover. (Click-streak suppression for the
	// CTF flag is layered on in Task 9.)
	sprite.addEventListener('click', openDismissPopover);
```

Replace that block with:

```ts
	// Sprite click — track for the 11th CTF flag, suppress popover during a
	// streak so the user can keep clicking, otherwise open the popover.
	sprite.addEventListener('click', () => {
		const now = Date.now();
		clickTimes = clickTimes.filter((t) => now - t < CLICK_STREAK_WINDOW_MS);
		clickTimes.push(now);
		if (clickTimes.length >= CLICK_STREAK_THRESHOLD) {
			captureById('clippy');
			setPose('cool');
			clickTimes = [];
			return;
		}
		// Streak active — suppress the popover so the click run isn't interrupted.
		if (clickTimes.length >= 2) {
			return;
		}
		openDismissPopover();
	});
```

- [ ] **Step 3: Remove the `void` lint-suppress lines that are no longer needed**

Find and remove:

```ts
void captureById;
void CLICK_STREAK_WINDOW_MS;
void CLICK_STREAK_THRESHOLD;
```

The bottom of the file should now end at the `init()` invocation block, with no trailing `void` calls.

- [ ] **Step 4: Type check**

```bash
npx astro check
```

Expected: `0/0/0`.

- [ ] **Step 5: Dev-server smoke**

Reload the desktop. Verify:
- Single Clippy click → dismiss popover opens (matches Task 8 behavior).
- Click "cancel", then click Clippy 7× rapidly within 10 seconds. Expected: a flag-captured toast appears for "office space"; Clippy plays `cool`. The popover does NOT open during the streak.
- Open `flags.exe`. The captured count should now be 1/11. The "office space" row should show as captured.
- Clear via `mills.reset()` to verify the flag also responds to the reset flow.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/clippy.ts
git commit -m "feat(clippy): 11th CTF flag — 7-click streak in 10s captures office space (#62)"
```

---

## Task 10: Local verification

Comprehensive checks before opening the PR. Browser smoke is human-only; everything else is automatable.

**Files:** none modified.

- [ ] **Step 1: Type check**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `0 errors`, `0 warnings`, `0 hints`.

- [ ] **Step 2: Production build**

```bash
SITE_URL=https://millsymills.com npm run build 2>&1 | tail -10
```

Expected: build completes without errors.

- [ ] **Step 3: Verify all 8 sprite sheets ship to dist**

```bash
ls dist/clippy/ | wc -l
```

Expected: `8`. For exact filename check:

```bash
ls dist/clippy/idle.png dist/clippy/wakeup.png dist/clippy/leave.png dist/clippy/think.png dist/clippy/sleep.png dist/clippy/cool.png dist/clippy/tired.png dist/clippy/point-right.png
```

Expected: all 8 paths printed, exit 0.

- [ ] **Step 4: Verify rendered HTML mounts the Clippy aside**

```bash
grep -oE '<aside[^>]*id="clippy"[^>]*>' dist/index.html | head -1
```

Expected: a single line containing `id="clippy"` and `hidden`. The `hidden` attribute is correct — the controller removes it on `mills:boot-done`.

- [ ] **Step 5: Verify rendered HTML carries the 11th flag count**

```bash
grep -oE '11.*hidden CTF flags' dist/flags.html | head -1
```

Expected: a line containing `11 hidden CTF flags scattered across the site`. (If `dist/flags.html` doesn't exist, check `dist/flags/index.html` instead.)

- [ ] **Step 6: Confirm the dev-server log is free of `/clippy/*.png` 404s**

(Assumes a dev server has been running through the manual smoke tests in Tasks 6-9.)

```bash
DEV_LOG=$(ls -t /private/tmp/claude-501/*/tasks/*.output 2>/dev/null | head -1)
[ -n "$DEV_LOG" ] && grep -E '\[404\] /clippy/' "$DEV_LOG" | head -5 || echo "(no dev-server output found)"
```

Expected: no `[404]` lines for `/clippy/`. If any appear, a path in `Clippy.astro` doesn't match a file on disk.

- [ ] **Step 7: Manual browser smoke checklist**

Open `http://localhost:4321/` and walk through:
- [ ] Boot animation finishes → Clippy appears bottom-right with `wakeup` then settles into `idle`.
- [ ] Wakeup quip bubble appears and fades after ~4s.
- [ ] Mouse-still 30s → `think` + idle quip.
- [ ] (Optional, slow) Mouse-still 2min → `tired`. 5min → `sleep`.
- [ ] Capture a flag (use the konami code, or trigger from devtools `window.dispatchEvent(new CustomEvent('mills:flag-captured', { detail: {} }))`) → `cool` + flag quip.
- [ ] Click Clippy once → popover opens, first button focused.
- [ ] ESC → popover closes.
- [ ] Click "this session" → Clippy plays `leave`, hides. Reload → Clippy returns.
- [ ] Click "forever" → hides. Reload → still hidden. `mills.reset()` from console → returns.
- [ ] Click 7× in 10s → "office space" flag captured (toast fires); flags.exe shows 1/11.
- [ ] Resize to mobile breakpoint (<768px) — Clippy should NOT render.
- [ ] DevTools rendering panel: emulate `prefers-reduced-motion: reduce` → Clippy renders, no animation, sprite shows first frame.

- [ ] **Step 8: Stop the dev server if you started one for this task**

If a dev server was launched fresh for verification, stop it now (Ctrl-C). If it was already running, leave it.

---

## Task 11: Open PR

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/clippy-companion
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --title "feat(clippy): corner-dwelling Clippy companion (#62, #95)" --body "$(cat <<'EOF'
## Summary
Closes #62 by shipping the WinXp pack's actual Clippy as a corner-dwelling desktop companion. Tracks item 1 of #95.

8 curated poses (idle / wakeup / leave / think / sleep / cool / tired / point-right) animate via CSS \`step()\` keyframes scrubbing horizontal sprite sheets. Speech bubbles appear with per-app contextual quips. A confirmation popover handles dismissal (\"this session\" / \"forever\"). The 11th CTF flag fires on a 7-click streak within 10 seconds.

## What changed
- \`public/clippy/\` (new, ~14 MB) — 8 sprite sheets renamed kebab-case from the source pack.
- \`src/data/clippy-quips.ts\` (new) — quip pools with per-app overrides + \`pickQuip()\` helper.
- \`src/scripts/clippy.ts\` (new) — controller: pose state machine, idle ladder, dismiss popover, click-streak counter.
- \`src/components/desktop/Clippy.astro\` (new) — aside markup + scoped CSS, including \`@media (hover: none)\` and \`@media (prefers-reduced-motion: reduce)\` guards.
- \`src/scripts/boot.ts\` — dispatches \`mills:boot-done\` CustomEvent after the overlay finishes.
- \`src/scripts/flags.ts\` — adds the 11th \`clippy\` challenge (\`flag{paperclip_was_a_lifestyle}\`).
- \`src/data/apps.ts\` — bumps the \`flags\` app's \`ogDescription\` from "10 hidden CTF flags" to "11".
- \`src/layouts/DesktopLayout.astro\` — mounts \`<Clippy />\` once after \`<slot />\`.

## Design + decisions
See \`docs/superpowers/specs/2026-04-20-clippy-companion-design.md\` and \`docs/superpowers/plans/2026-04-20-clippy-companion.md\`.

Key calls: corner-dwelling (not cursor-following) so the full-body pose animations play in place; bubbles + per-app quips for the actual Office Assistant gag; popover with session/forever persistence for graceful dismissal; \`tired\` rewired into the long-idle progression because no error-toast surface exists in the codebase.

## Out of scope
- Drag-and-drop of Clippy.
- Sound effects (#95 item 4 — separate brainstorm).
- Wallpaper picker, WinIcons sprite-sheet, Minesweeper Easter egg — separate items in #95.
- The remaining 17 unused Clippy poses in the source pack.

## Test plan
- [x] \`npx astro check\` clean (0/0/0)
- [x] \`SITE_URL=https://millsymills.com npm run build\` succeeds
- [x] \`dist/clippy/\` ships all 8 PNGs
- [x] \`dist/index.html\` contains \`<aside id=\"clippy\" hidden>\`
- [x] \`dist/flags/...\` advertises 11 hidden CTF flags
- [ ] Browser smoke: pose ladder, dismiss popover, ESC, 7-click flag, mobile hide, reduced-motion (see plan Task 10 Step 7 for the full checklist)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Confirm the PR appears on issue #62 + #95**

```bash
gh issue view 62 --json url,closedByPullRequestsReferences
gh issue view 95 --json url,closedByPullRequestsReferences
```

Expected: the new PR appears in both `closedByPullRequestsReferences` arrays.

---

## Done

When all task checkboxes above are `[x]`:
- Clippy lives bottom-right after boot, plays the curated 8-pose ladder.
- Bubbles speak per-app quips on idle/flag/wakeup triggers.
- Click → dismiss popover with persistence; 7-click streak captures the 11th flag.
- Mobile and reduced-motion users get the right experience (hidden / static).
- Build is green; dist ships sprites + the bumped OG metadata.
- PR is open against `main`, references #62 and #95.
