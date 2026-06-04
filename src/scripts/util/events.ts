// Typed CustomEvent helpers for the cross-module mills:* events.
//
// Centralizes (a) the event-name strings, (b) the detail payload shapes,
// and (c) the dispatch boilerplate, so a typo in either name or payload
// is a TypeScript error at the call site rather than a silent no-op at
// runtime.

import type { AppId } from '../../data/apps';
import type { QuipTrigger } from '../../data/clippy-quips';

/**
 * The complete map of mills:* events. Both `Window` and `Document` listen,
 * so we augment both global event maps below — the dispatch helpers below
 * fire on `window` or `document` per their existing convention.
 */
export interface MillsEventMap {
	// `null` rather than `void`/`undefined` — at runtime, `new CustomEvent(name)`
	// without an init dict produces `detail === null` (per CustomEventInit
	// in WebIDL), so this is the type that matches what listeners actually
	// observe. The dispatcher passes `{ detail: null }` explicitly to keep
	// type and runtime in lockstep.
	'mills:boot-done': CustomEvent<null>;
	'mills:now-playing': CustomEvent<NowPlaying>;
	'mills:close-window': CustomEvent<{ id: string }>;
	'mills:clippy-trigger': CustomEvent<ClippyTriggerDetail>;
	'mills:play-sound': CustomEvent<{ kind: SoundKind }>;
	// Fired by window-manager AFTER a window transitions hidden -> visible
	// (a true open, not a focus-raise on an already-open window). The
	// `userGesture` flag is true when the open came from a click/keyboard
	// path with a real user interaction (taskbar start menu, desktop icon,
	// context menu) and false when the open was initiated by code (the
	// `initialOpen` prop / deep-link bootstrap, programmatic restore from
	// localStorage). Subscribers that want to call audio.play() should
	// gate on `userGesture` -- the autoplay policy will reject play()
	// without one and surface NotAllowedError.
	'mills:window-open': CustomEvent<{ id: string; userGesture: boolean }>;
	// Fired by window-manager AFTER a window transitions visible -> hidden
	// (a true close, not a no-op on an already-closed window). Subscribers
	// can release per-window resources (audio playback, observers, etc.).
	'mills:window-closed': CustomEvent<{ id: string }>;
}

export type SoundKind = 'open' | 'close' | 'error' | 'startup' | 'reset';

export interface NowPlaying {
	playing: boolean;
	title: string;
	artist: string;
}

export interface ClippyTriggerDetail {
	trigger: QuipTrigger;
	// Optional explicit app context. Producers leave this unset to let
	// Clippy's controller resolve via the topmost-window heuristic.
	appId?: AppId;
}

declare global {
	interface WindowEventMap extends MillsEventMap {}
	interface DocumentEventMap extends MillsEventMap {}
}

// ---- dispatch helpers (call site is the producer's choice of target) ----

export function dispatchBootDone(): void {
	window.dispatchEvent(new CustomEvent('mills:boot-done', { detail: null }));
}

export function dispatchNowPlaying(detail: NowPlaying): void {
	window.dispatchEvent(new CustomEvent('mills:now-playing', { detail }));
}

export function dispatchCloseWindow(id: string): void {
	document.dispatchEvent(new CustomEvent('mills:close-window', { detail: { id } }));
}

export function dispatchClippyTrigger(trigger: QuipTrigger, appId?: AppId): void {
	window.dispatchEvent(
		new CustomEvent('mills:clippy-trigger', { detail: { trigger, appId } }),
	);
}

export function dispatchPlaySound(kind: SoundKind): void {
	window.dispatchEvent(new CustomEvent('mills:play-sound', { detail: { kind } }));
}

export function dispatchWindowOpen(id: string, userGesture: boolean): void {
	window.dispatchEvent(
		new CustomEvent('mills:window-open', { detail: { id, userGesture } }),
	);
}

export function dispatchWindowClosed(id: string): void {
	window.dispatchEvent(
		new CustomEvent('mills:window-closed', { detail: { id } }),
	);
}
