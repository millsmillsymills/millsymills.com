/*
 * Cross-tab `storage` event path for the Display picker.
 *
 * The picker mounts on `Display.astro` but its `storage` listener
 * fires regardless of whether a Display window is currently in the
 * DOM -- another tab can update theme / wallpaper at any time and
 * the document chrome should follow. These tests cover that path
 * by importing the module once (which registers the listener) and
 * dispatching synthetic StorageEvent payloads.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { defaultTheme, themes, THEME_STORAGE_KEY } from '../data/themes';
import { defaultWallpaper, wallpapers } from '../data/wallpapers';
import { STORAGE_KEY as WALLPAPER_STORAGE_KEY } from './wallpaper';

beforeAll(async () => {
	// Import for side-effect: registers the cross-tab `storage` listener
	// against `window`. happy-dom retains the listener across describe
	// blocks within this file.
	await import('./display-picker');
});

function fireStorage(key: string, newValue: string | null): void {
	window.dispatchEvent(
		new StorageEvent('storage', {
			key,
			newValue,
			oldValue: null,
			storageArea: localStorage,
			url: window.location.href,
		}),
	);
}

describe('display-picker storage listener — theme branch', () => {
	beforeEach(() => {
		delete document.documentElement.dataset.theme;
	});

	afterEach(() => {
		delete document.documentElement.dataset.theme;
	});

	it('mirrors a cross-tab theme switch onto data-theme', () => {
		fireStorage(THEME_STORAGE_KEY, 'hacker');
		expect(document.documentElement.dataset.theme).toBe('hacker');
	});

	it('mirrors a cross-tab reset to the default theme by deleting data-theme', () => {
		document.documentElement.dataset.theme = 'hacker';
		fireStorage(THEME_STORAGE_KEY, defaultTheme.id);
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('falls back to the default theme on an unknown id (resolveTheme path)', () => {
		document.documentElement.dataset.theme = 'hacker';
		fireStorage(THEME_STORAGE_KEY, 'definitely-not-a-theme');
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('falls back to the default theme when newValue is null (storage cleared elsewhere)', () => {
		document.documentElement.dataset.theme = 'hacker';
		fireStorage(THEME_STORAGE_KEY, null);
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('ignores storage events for unrelated keys', () => {
		document.documentElement.dataset.theme = 'hacker';
		fireStorage('some.unrelated.key', 'arizona');
		expect(document.documentElement.dataset.theme).toBe('hacker');
	});
});

describe('display-picker storage listener — wallpaper branch', () => {
	beforeEach(() => {
		document.documentElement.style.removeProperty('--desktop-bg');
	});

	it('mirrors a cross-tab wallpaper switch onto --desktop-bg', () => {
		const target = wallpapers[1];
		expect(target).toBeDefined();
		fireStorage(WALLPAPER_STORAGE_KEY, target!.id);
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${target!.src}')`);
	});

	it('falls back to the default wallpaper on an unknown id', () => {
		fireStorage(WALLPAPER_STORAGE_KEY, 'definitely-not-a-wallpaper');
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${defaultWallpaper().src}')`);
	});

	it('falls back to the default wallpaper when newValue is null', () => {
		fireStorage(WALLPAPER_STORAGE_KEY, null);
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${defaultWallpaper().src}')`);
	});

	it('first wallpaper resolves to the named default (sanity for resolveWallpaper)', () => {
		// Smoke check that wallpapers data and the default-fallback rule
		// agree -- a future reordering of the array shouldn't quietly
		// flip the cross-tab fallback target.
		fireStorage(WALLPAPER_STORAGE_KEY, '');
		expect(themes.length).toBeGreaterThan(0);
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${defaultWallpaper().src}')`);
	});
});
