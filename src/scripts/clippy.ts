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

let currentPose: Pose = 'idle';
let returnToIdleTimer: number | null = null;
let bubbleHideTimer: number | null = null;
let idleThinkTimer: number | null = null;
let idleTiredTimer: number | null = null;
let idleSleepTimer: number | null = null;
let clickTimes: number[] = [];

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

	// Flag captured anywhere → cool pose + contextual quip. Reset the idle
	// ladder so a capture at minute 4 of an idle session doesn't let Clippy
	// fall asleep mid-celebration.
	window.addEventListener('mills:flag-captured', () => {
		resetIdleTimers();
		setPose('cool');
		speak(pickQuip(getCurrentAppId(), 'flag'));
	});

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

	w.mills = { ...(w.mills ?? {}), __clippyInit: true };
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

