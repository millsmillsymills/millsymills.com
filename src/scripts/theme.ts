/*
 * Theme state + DOM application.
 *
 * Storage shape: a bare theme id string under `mills.theme.v1`.
 * The reset.ts `mills.` prefix sweep clears this alongside other UI state.
 */

import { defaultTheme, findTheme, THEME_STORAGE_KEY, type Theme } from '../data/themes';

export { THEME_STORAGE_KEY as STORAGE_KEY };

export function getActiveId(): string | null {
	try {
		return localStorage.getItem(THEME_STORAGE_KEY);
	} catch (err) {
		console.warn('[mills.theme] localStorage.getItem failed', err);
		return null;
	}
}

export function setActiveId(id: string): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, id);
	} catch (err) {
		console.warn('[mills.theme] save failed; choice won\'t persist', err);
	}
}

export function resolveTheme(id: string | null): Theme {
	return findTheme(id) ?? defaultTheme;
}

export function applyToDocument(theme: Theme): void {
	const root = document.documentElement;
	if (theme.id === defaultTheme.id) {
		delete root.dataset.theme;
		return;
	}
	root.dataset.theme = theme.id;
}
