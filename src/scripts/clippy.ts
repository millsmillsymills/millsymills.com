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

// Touch the imports + constants to keep the linter from flagging them — they're
// consumed in Tasks 7-9 of the implementation plan. These lines are removed
// over the next three tasks as each symbol is wired up.
void pickQuip;
void captureById;
void POSE_DURATIONS_MS;
void IDLE_THINK_MS;
void IDLE_TIRED_MS;
void IDLE_SLEEP_MS;
void QUIP_VISIBLE_MS;
void CLICK_STREAK_WINDOW_MS;
void CLICK_STREAK_THRESHOLD;
