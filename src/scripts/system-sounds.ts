/*
 * Opt-in XP system sounds — state + playback API.
 *
 * Pure module: no DOM side effects on import. The side-effect bootstrap
 * (event listeners + taskbar toggle wiring) lives in
 * `system-sounds-init.ts`, mirroring the wallpaper / wallpaper-init split.
 *
 * Persistence: bool string under `mills.sounds.enabled`. Default off —
 * a first-time visitor never hears anything. The reset.ts `mills.`
 * prefix sweep picks this key up alongside other site state.
 *
 * Autoplay policy: every `play()` is a no-op until a user gesture has
 * been observed. The startup chime is the only sound that can fire
 * pre-gesture (boot-done arrives before any click on a fresh tab) —
 * when that happens it's deferred and replays once on first gesture.
 */

import type { SoundKind } from './util/events';

export const STORAGE_KEY = 'mills.sounds.enabled';

export const SOURCES: Readonly<Record<SoundKind, string>> = {
	open: '/sounds/restore.wav',
	close: '/sounds/minimize.wav',
	error: '/sounds/error.wav',
	startup: '/sounds/startup.wav',
	reset: '/sounds/recycle.wav',
} as const;

const pool: Partial<Record<SoundKind, HTMLAudioElement>> = {};
let userGestureSeen = false;
let pendingStartup = false;

export function isEnabled(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch (err) {
		console.warn('[mills.sounds] localStorage.getItem failed', err);
		return false;
	}
}

export function setEnabled(value: boolean): void {
	try {
		localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	} catch (err) {
		console.warn('[mills.sounds] save failed; choice will not persist', err);
	}
}

function getAudio(kind: SoundKind): HTMLAudioElement {
	let a = pool[kind];
	if (!a) {
		a = new Audio(SOURCES[kind]);
		a.preload = 'auto';
		pool[kind] = a;
	}
	return a;
}

export function play(kind: SoundKind): void {
	if (!isEnabled()) return;
	if (!userGestureSeen) {
		if (kind === 'startup') pendingStartup = true;
		return;
	}
	const a = getAudio(kind);
	try {
		a.currentTime = 0;
		// Promise rejects on autoplay block. Swallow — the gesture-gate
		// above should keep us out of that path, but defensive `.catch`
		// keeps console warnings off if a browser surprises us.
		void a.play().catch(() => {});
	} catch (err) {
		console.debug('[mills.sounds] play failed', kind, err);
	}
}

export function markGesture(): void {
	if (userGestureSeen) return;
	userGestureSeen = true;
	if (pendingStartup) {
		pendingStartup = false;
		play('startup');
	}
}
