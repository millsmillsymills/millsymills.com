// Clippy companion controller. See src/components/desktop/Clippy.astro for
// markup + CSS, and docs/superpowers/specs/2026-04-20-clippy-companion-design.md
// for the full design.

import { isAppId, type AppId } from '../data/apps';
import { pickQuip, type QuipPose as Pose } from '../data/clippy-quips';
import { captureById } from './flags';

const POSE_DURATIONS_MS: Record<Pose, number> = {
	idle: 2400,
	wakeup: 1500,
	leave: 800,
	think: 3500,
	sleep: 9000,
	cool: 3500,
	tired: 8000,
};

const IDLE_THINK_MS = 30_000;
const IDLE_TIRED_MS = 120_000;
const IDLE_SLEEP_MS = 300_000;
const QUIP_VISIBLE_MS = 4000;
const CLICK_STREAK_WINDOW_MS = 10_000;
const CLICK_STREAK_THRESHOLD = 7;
const ERROR_QUIET_MS = 8000;
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

function getCurrentAppId(): AppId | undefined {
	// Heuristic: the topmost open window in the desktop's z-stack is the
	// "current" app for quip context. Falls back to undefined (default pool)
	// when no windows are open or the topmost window's id isn't recognized.
	//
	// FRAGILE COUPLING: relies on `window-manager.ts` writing z-index as an
	// inline `style.zIndex` (see `applyZ()` in that file). If WM ever moves
	// z-index management to a CSS class, this sort collapses to DOM-order.
	// If you change WM's z-index strategy, update both call sites together.
	const visible = Array.from(
		document.querySelectorAll<HTMLElement>('.window:not([hidden])'),
	).sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
	const id = visible[0]?.dataset.windowId;
	return isAppId(id) ? id : undefined;
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
		const entry = pickQuip(getCurrentAppId(), 'idle');
		if (entry) speak(entry.quip);
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

function isDismissed(): boolean {
	try {
		if (localStorage.getItem(STORAGE_KEY) === 'forever') return true;
	} catch (err) {
		console.warn('[mills.clippy] localStorage.getItem failed', err);
	}
	try {
		if (sessionStorage.getItem(STORAGE_KEY) === 'session') return true;
	} catch (err) {
		console.warn('[mills.clippy] sessionStorage.getItem failed', err);
	}
	return false;
}

function dismiss(scope: 'session' | 'forever'): void {
	closeDismissPopover();
	setPose('leave');
	const store = scope === 'forever' ? localStorage : sessionStorage;
	try {
		store.setItem(STORAGE_KEY, scope);
	} catch (err) {
		// Storage disabled — Clippy hides for this page-view, but in-tab
		// navigation will resurrect it. Acceptable degradation.
		console.warn('[mills.clippy] dismiss persistence failed', err);
	}
	// After the leave animation finishes, hide the aside entirely.
	window.setTimeout(() => {
		if (aside) aside.hidden = true;
	}, POSE_DURATIONS_MS.leave);
}

function init(): void {
	// Idempotency guard — match the pattern from reset.ts (#67).
	if (window.mills?.__clippyInit) return;

	// Render guards.
	if (window.matchMedia('(hover: none)').matches) return;
	if (isDismissed()) return;

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
			const entry = pickQuip(undefined, 'wakeup');
			if (!entry) return;
			if (entry.pose) setPose(entry.pose);
			speak(entry.quip);
		}, POSE_DURATIONS_MS.wakeup);
		resetIdleTimers();
	});

	// Generic trigger event — producers (window-manager, display-picker,
	// reset, future easter eggs) fire `mills:clippy-trigger` so this
	// controller doesn't import every module that wants Clippy to react.
	window.addEventListener('mills:clippy-trigger', (e) => {
		const { trigger, appId } = e.detail;
		resetIdleTimers();
		const entry = pickQuip(appId ?? getCurrentAppId(), trigger);
		if (!entry) return;
		if (entry.pose) setPose(entry.pose);
		speak(entry.quip);
	});

	// Uncaught script errors → tired pose + commiseration. Plain `error`
	// listener so we catch both runtime errors and resource-load failures.
	// Throttled — a broken image plus a dead script can fire dozens of
	// errors in a tight burst; one quip per ERROR_QUIET_MS is plenty.
	let lastErrorAt = 0;
	window.addEventListener('error', () => {
		const now = Date.now();
		if (now - lastErrorAt < ERROR_QUIET_MS) return;
		lastErrorAt = now;
		const entry = pickQuip(getCurrentAppId(), 'error');
		if (!entry) return;
		if (entry.pose) setPose(entry.pose);
		speak(entry.quip);
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
		const entry = pickQuip(getCurrentAppId(), 'flag');
		if (entry) speak(entry.quip);
	});

	// Sprite click — track for the clippy CTF flag, suppress popover during a
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

	Object.assign((window.mills ??= {}), { __clippyInit: true });
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

