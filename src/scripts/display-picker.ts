/*
 * display.cpl picker — wires each wallpaper tile to the live-apply +
 * persist flow, and marks the active tile so the UI reflects state on
 * mount and after every click.
 *
 * Mounts on every Display.astro instance found in the DOM; both the
 * desktop window and the (future) per-app permalink page render the
 * same component, so the handler should be tolerant of being called
 * twice.
 */

import {
	applyToDocument as applyWallpaperToDocument,
	getActiveId as getActiveWallpaperId,
	resolveWallpaper,
	setActiveId as setActiveWallpaperId,
	STORAGE_KEY as WALLPAPER_STORAGE_KEY,
} from './wallpaper';
import {
	applyToDocument as applyThemeToDocument,
	getActiveId as getActiveThemeId,
	resolveTheme,
	setActiveId as setActiveThemeId,
	STORAGE_KEY as THEME_STORAGE_KEY,
} from './theme';
import { defaultTheme } from '../data/themes';
import { defaultWallpaper } from '../data/wallpapers';
import { dispatchClippyTrigger } from './util/events';

function syncActiveWallpaperTile(root: HTMLElement, id: string): void {
	root.querySelectorAll<HTMLButtonElement>('[data-wallpaper]').forEach((btn) => {
		const isActive = btn.dataset.wallpaper === id;
		btn.classList.toggle('display__tile--active', isActive);
		btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
	});
}

function syncActiveThemeTile(root: HTMLElement, id: string): void {
	root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((btn) => {
		const isActive = btn.dataset.themeChoice === id;
		btn.classList.toggle('display__tile--active', isActive);
		btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
	});
}

function syncAllWallpapers(id: string): void {
	document
		.querySelectorAll<HTMLElement>('.display')
		.forEach((el) => syncActiveWallpaperTile(el, id));
}

function syncAllThemes(id: string): void {
	document
		.querySelectorAll<HTMLElement>('.display')
		.forEach((el) => syncActiveThemeTile(el, id));
}

function bind(root: HTMLElement): void {
	root.querySelectorAll<HTMLButtonElement>('[data-wallpaper]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const id = btn.dataset.wallpaper;
			if (!id) return;
			const wallpaper = resolveWallpaper(id);
			applyWallpaperToDocument(wallpaper);
			setActiveWallpaperId(wallpaper.id);
			// Sync every Display instance — there can be two on the page
			// (desktop window + mobile shell), and both should reflect the
			// new selection so navigating between surfaces stays coherent.
			syncAllWallpapers(wallpaper.id);
			dispatchClippyTrigger('wallpaper', 'display');
		});
	});

	root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const id = btn.dataset.themeChoice;
			if (!id) return;
			const theme = resolveTheme(id);
			applyThemeToDocument(theme);
			setActiveThemeId(theme.id);
			syncAllThemes(theme.id);
		});
	});

	syncActiveWallpaperTile(root, getActiveWallpaperId() ?? defaultWallpaper().id);
	syncActiveThemeTile(root, getActiveThemeId() ?? defaultTheme.id);
}

function init(): void {
	document.querySelectorAll<HTMLElement>('.display').forEach(bind);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Cross-tab sync: if another tab picks a different wallpaper, mirror
	// that choice here so the UI doesn't lie about state.
	window.addEventListener('storage', (e) => {
		if (e.key === WALLPAPER_STORAGE_KEY) {
			const wallpaper = resolveWallpaper(e.newValue);
			applyWallpaperToDocument(wallpaper);
			syncAllWallpapers(wallpaper.id);
		}

		if (e.key === THEME_STORAGE_KEY) {
			const theme = resolveTheme(e.newValue);
			applyThemeToDocument(theme);
			syncAllThemes(theme.id);
		}
	});
}

export {};
