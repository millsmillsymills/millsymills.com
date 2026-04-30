/*
 * Wallpaper state + CSS-var application.
 *
 * Both the early-bootstrap script (wallpaper-init.ts) and the picker UI
 * (display-picker.ts) import from here so storage shape and DOM-write
 * semantics stay in lockstep. The CSS rule in desktop.css reads
 * `background-image: var(--desktop-bg)` — this module is what writes
 * the variable.
 *
 * Storage shape: a bare wallpaper id string (no JSON wrapper) under
 * `mills.wallpaper.v1`. The reset.ts `mills.` prefix sweep already
 * picks this up alongside other site state.
 */

import { defaultWallpaper, findWallpaper, type Wallpaper } from '../data/wallpapers';

export const STORAGE_KEY = 'mills.wallpaper.v1';

export function getActiveId(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch (err) {
		console.warn('[mills.wallpaper] localStorage.getItem failed', err);
		return null;
	}
}

export function setActiveId(id: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch (err) {
		console.warn('[mills.wallpaper] save failed; choice won\'t persist', err);
	}
}

export function resolveWallpaper(id: string | null): Wallpaper {
	return findWallpaper(id) ?? defaultWallpaper();
}

export function applyToDocument(wallpaper: Wallpaper): void {
	// `documentElement` is reachable from <head>-deferred modules even
	// before <body> finishes parsing, so the CSS variable is in place
	// before .desktop's first paint.
	document.documentElement.style.setProperty('--desktop-bg', `url('${wallpaper.src}')`);
}
