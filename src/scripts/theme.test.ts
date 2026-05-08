import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	defaultTheme,
	DEFAULT_THEME_ID,
	findTheme,
	themes,
	THEME_STORAGE_KEY,
} from '../data/themes';
import {
	applyToDocument,
	getActiveId,
	resolveTheme,
	setActiveId,
	STORAGE_KEY,
} from './theme';

describe('themes data', () => {
	it('exports a default theme that matches DEFAULT_THEME_ID', () => {
		expect(defaultTheme.id).toBe(DEFAULT_THEME_ID);
		expect(themes.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
	});

	it('findTheme returns undefined for null', () => {
		expect(findTheme(null)).toBeUndefined();
	});

	it('findTheme returns undefined for unknown id', () => {
		expect(findTheme('not-a-theme')).toBeUndefined();
	});

	it('findTheme returns undefined for empty string', () => {
		expect(findTheme('')).toBeUndefined();
	});

	it('findTheme returns the matching theme for a real id', () => {
		expect(findTheme('hacker')?.id).toBe('hacker');
	});
});

describe('theme.ts STORAGE_KEY re-export', () => {
	it('matches the data-layer constant so producers and consumers stay in lockstep', () => {
		expect(STORAGE_KEY).toBe(THEME_STORAGE_KEY);
	});
});

describe('theme.ts resolveTheme', () => {
	it('returns the default theme for null', () => {
		expect(resolveTheme(null).id).toBe(defaultTheme.id);
	});

	it('returns the default theme for unknown id', () => {
		expect(resolveTheme('does-not-exist').id).toBe(defaultTheme.id);
	});

	it('returns the matching theme for a real id', () => {
		expect(resolveTheme('hacker').id).toBe('hacker');
	});
});

describe('theme.ts applyToDocument', () => {
	beforeEach(() => {
		// happy-dom resets between files but not always between tests;
		// be explicit about the starting state so each assertion is
		// hermetic.
		delete document.documentElement.dataset.theme;
	});

	it('deletes data-theme when the default theme is applied', () => {
		document.documentElement.dataset.theme = 'hacker';
		applyToDocument(defaultTheme);
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('sets data-theme to the theme id for non-default themes', () => {
		const hacker = findTheme('hacker');
		expect(hacker).toBeDefined();
		applyToDocument(hacker!);
		expect(document.documentElement.dataset.theme).toBe('hacker');
	});

	it('round-trips: setting then defaulting clears the attribute', () => {
		const hacker = findTheme('hacker')!;
		applyToDocument(hacker);
		expect(document.documentElement.dataset.theme).toBe('hacker');
		applyToDocument(defaultTheme);
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});
});

describe('theme.ts getActiveId / setActiveId', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('round-trips through localStorage', () => {
		setActiveId('hacker');
		expect(getActiveId()).toBe('hacker');
	});

	it('returns null when nothing is stored', () => {
		expect(getActiveId()).toBeNull();
	});

	it('returns null when localStorage.getItem throws (private mode / quota)', () => {
		// First-time visitors hit this path on browsers that disable
		// localStorage in private mode -- the accessor should fall back
		// to null cleanly so resolveTheme(null) -> defaultTheme.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError', 'QuotaExceededError');
		});
		expect(getActiveId()).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
	});

	it('swallows setItem failures so the click handler does not throw', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError', 'QuotaExceededError');
		});
		expect(() => setActiveId('hacker')).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});
});
