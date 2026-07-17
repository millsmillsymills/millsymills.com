/*
 * CRT power-on intro. Runs exactly once per tab — suppressed after
 * the first playthrough (sessionStorage) so in-tab navigation and
 * per-app permalink routes don't replay it. Skipped entirely when
 * the user prefers reduced motion.
 */

import { dispatchBootDone } from './util/events';

export const SESSION_KEY = 'mills.boot.played';

const FINISH_DELAY_MS = 1400;
const REMOVE_DELAY_MS = 600;

let activeOverlay: HTMLElement | null = null;
let done = false;

function shouldPlay(): boolean {
	try {
		if (sessionStorage.getItem(SESSION_KEY)) return false;
	} catch (err) {
		// Storage disabled / private browsing — degrade safe: skip the
		// animation rather than risk replaying it on every navigation.
		console.warn('[mills.boot] sessionStorage unavailable; skipping intro', err);
		return false;
	}
	try {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
	} catch (err) {
		console.warn('[mills.boot] matchMedia unavailable', err);
	}
	return true;
}

function markPlayed(): void {
	try {
		sessionStorage.setItem(SESSION_KEY, '1');
	} catch (err) {
		// Marker won't persist — boot animation will replay on next load
		// in the same session. Visible regression but not a data-loss bug.
		console.warn('[mills.boot] markPlayed failed; intro may replay', err);
	}
}

export function finish(): void {
	// Latch: click-to-skip and the FINISH_DELAY_MS timer both call finish;
	// without this guard a near-1.4s click runs it twice, double-firing
	// boot-done.
	if (done) return;
	done = true;
	activeOverlay?.classList.add('boot-overlay--done');
	const overlay = activeOverlay;
	// Notify subscribers (e.g. Clippy) that the boot animation is finished
	// and the desktop is interactive.
	dispatchBootDone();
	if (overlay) setTimeout(() => overlay.remove(), REMOVE_DELAY_MS);
}

export function init(): void {
	const overlay = document.querySelector<HTMLElement>('.boot-overlay');
	if (!overlay) return;

	if (!shouldPlay()) {
		overlay.remove();
		// Even when the boot animation is suppressed (already-played in this
		// session, or prefers-reduced-motion), the desktop is interactive.
		// Subscribers (e.g. Clippy) need to know.
		dispatchBootDone();
		return;
	}

	overlay.classList.add('boot-overlay--on');
	markPlayed();

	activeOverlay = overlay;
	done = false;

	// allow click-to-skip
	overlay.addEventListener('click', finish, { once: true });

	setTimeout(finish, FINISH_DELAY_MS);
}

/**
 * Test-only: clear module-scope state so each spec starts from a
 * known fresh-tab baseline. Underscored to make the not-for-prod
 * intent loud. Mirrors the `__resetForTests` pattern used in
 * `system-sounds.ts`.
 */
export function __resetForTests(): void {
	activeOverlay = null;
	done = false;
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}
