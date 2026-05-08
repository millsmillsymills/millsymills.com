/*
 * display.cpl picker — wires each wallpaper / theme tile to the
 * live-apply + persist flow, and marks the active tile so the UI
 * reflects state on mount and after every click.
 *
 * Mounts on every Display.astro instance found in the DOM; both the
 * desktop window and the per-app permalink page render the same
 * component. `bind()` uses a single delegated container listener (one
 * per Display instance) so re-running `init()` against the same DOM
 * (HMR, future page transitions) cannot accumulate per-button
 * listeners. The `storage` listener carries an idempotency guard so
 * that a future bundler split into per-instance chunks cannot
 * multiply it.
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
import { dispatchClippyTrigger } from './util/events';

const BIND_FLAG = 'displayPickerBound';

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
	// Delegate to a single container listener so re-binding the same
	// root cannot accumulate per-button listeners. Idempotency is
	// further enforced by the dataset flag below.
	if (root.dataset[BIND_FLAG] === '1') return;
	root.dataset[BIND_FLAG] = '1';

	root.addEventListener('click', (e) => {
		const target = e.target as Element | null;
		if (!target) return;

		const wallpaperBtn = target.closest<HTMLElement>('[data-wallpaper]');
		if (wallpaperBtn) {
			const id = wallpaperBtn.dataset.wallpaper;
			if (!id) return;
			const wallpaper = resolveWallpaper(id);
			applyWallpaperToDocument(wallpaper);
			setActiveWallpaperId(wallpaper.id);
			syncAllWallpapers(wallpaper.id);
			dispatchClippyTrigger('wallpaper', 'display');
			return;
		}

		const themeBtn = target.closest<HTMLElement>('[data-theme-choice]');
		if (themeBtn) {
			const id = themeBtn.dataset.themeChoice;
			if (!id) return;
			const theme = resolveTheme(id);
			applyThemeToDocument(theme);
			setActiveThemeId(theme.id);
			syncAllThemes(theme.id);
		}
	});

	// Mount-time sync routes through resolve* so the default-fallback
	// rule lives in exactly one place. Inlining `?? defaultTheme.id`
	// here would diverge silently if the named-default constant ever
	// stops matching what `resolveTheme` returns.
	syncActiveWallpaperTile(root, resolveWallpaper(getActiveWallpaperId()).id);
	syncActiveThemeTile(root, resolveTheme(getActiveThemeId()).id);
}

function init(): void {
	document.querySelectorAll<HTMLElement>('.display').forEach(bind);
}

let storageListenerRegistered = false;

if (typeof window !== 'undefined') {
	// Astro emits this script at the bottom of `Display.astro`, so
	// `readyState` is always `interactive` or `complete` by the time
	// it runs. The previous `if (readyState === 'loading')` branch was
	// dead code.
	init();

	if (!storageListenerRegistered) {
		storageListenerRegistered = true;
		// Cross-tab sync: if another tab picks a different wallpaper
		// or theme, mirror that choice here so the UI doesn't lie
		// about state.
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
}

export {};
