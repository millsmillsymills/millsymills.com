// Typed CustomEvent helpers for the cross-module mills:* events.
//
// Centralizes (a) the event-name strings, (b) the detail payload shapes,
// and (c) the dispatch boilerplate, so a typo in either name or payload
// is a TypeScript error at the call site rather than a silent no-op at
// runtime.

import type { Challenge } from '../flags';

/**
 * The complete map of mills:* events. Both `Window` and `Document` listen,
 * so we augment both global event maps below — the dispatch helpers below
 * fire on `window` or `document` per their existing convention.
 */
export interface MillsEventMap {
	'mills:boot-done': CustomEvent<void>;
	'mills:flag-captured': CustomEvent<Challenge>;
	'mills:flags-unlocked': CustomEvent<Challenge>;
	'mills:now-playing': CustomEvent<NowPlaying>;
	'mills:close-window': CustomEvent<{ id: string }>;
}

export interface NowPlaying {
	playing: boolean;
	title: string;
	artist: string;
}

declare global {
	interface WindowEventMap extends MillsEventMap {}
	interface DocumentEventMap extends MillsEventMap {}
}

// ---- dispatch helpers (call site is the producer's choice of target) ----

export function dispatchBootDone(): void {
	window.dispatchEvent(new CustomEvent('mills:boot-done'));
}

export function dispatchFlagCaptured(challenge: Challenge): void {
	window.dispatchEvent(new CustomEvent('mills:flag-captured', { detail: challenge }));
}

/**
 * Fired exactly once per profile — on the first capture. Carries the same
 * Challenge payload as `mills:flag-captured` so subscribers can render
 * something specific to the unlock moment (e.g. the celebration banner).
 */
export function dispatchFlagsUnlocked(challenge: Challenge): void {
	window.dispatchEvent(new CustomEvent('mills:flags-unlocked', { detail: challenge }));
}

export function dispatchNowPlaying(detail: NowPlaying): void {
	window.dispatchEvent(new CustomEvent('mills:now-playing', { detail }));
}

export function dispatchCloseWindow(id: string): void {
	document.dispatchEvent(new CustomEvent('mills:close-window', { detail: { id } }));
}
