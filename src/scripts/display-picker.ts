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

import { applyToDocument, getActiveId, resolveWallpaper, setActiveId, STORAGE_KEY } from './wallpaper';
import { defaultWallpaper } from '../data/wallpapers';
import { dispatchClippyTrigger } from './util/events';

function syncActiveTile(root: HTMLElement, id: string): void {
	root.querySelectorAll<HTMLButtonElement>('[data-wallpaper]').forEach((btn) => {
		const isActive = btn.dataset.wallpaper === id;
		btn.classList.toggle('display__tile--active', isActive);
		btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
	});
}

function bind(root: HTMLElement): void {
	root.querySelectorAll<HTMLButtonElement>('[data-wallpaper]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const id = btn.dataset.wallpaper;
			if (!id) return;
			const wallpaper = resolveWallpaper(id);
			applyToDocument(wallpaper);
			setActiveId(wallpaper.id);
			// Sync every Display instance — there can be two on the page
			// (desktop window + mobile shell), and both should reflect the
			// new selection so navigating between surfaces stays coherent.
			document
				.querySelectorAll<HTMLElement>('.display')
				.forEach((el) => syncActiveTile(el, wallpaper.id));
			dispatchClippyTrigger('wallpaper', 'display');
		});
	});

	syncActiveTile(root, getActiveId() ?? defaultWallpaper().id);
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
		if (e.key !== STORAGE_KEY) return;
		const wallpaper = resolveWallpaper(e.newValue);
		applyToDocument(wallpaper);
		document
			.querySelectorAll<HTMLElement>('.display')
			.forEach((el) => syncActiveTile(el, wallpaper.id));
	});
}

export {};
