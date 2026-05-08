import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultWallpaper, findWallpaper, wallpapers } from '../data/wallpapers';
import {
	applyToDocument,
	getActiveId,
	resolveWallpaper,
	setActiveId,
	STORAGE_KEY,
} from './wallpaper';

describe('wallpapers data', () => {
	it('exposes exactly one entry flagged default: true', () => {
		const flagged = wallpapers.filter((w) => w.default === true);
		expect(flagged).toHaveLength(1);
		expect(defaultWallpaper().id).toBe(flagged[0]?.id);
	});

	it('findWallpaper returns undefined for null/undefined/empty', () => {
		expect(findWallpaper(null)).toBeUndefined();
		expect(findWallpaper(undefined)).toBeUndefined();
		expect(findWallpaper('')).toBeUndefined();
	});

	it('findWallpaper returns undefined for unknown id', () => {
		expect(findWallpaper('not-a-wallpaper')).toBeUndefined();
	});

	it('findWallpaper returns the matching wallpaper for a real id', () => {
		const real = wallpapers[1]?.id;
		expect(real).toBeDefined();
		expect(findWallpaper(real!)?.id).toBe(real);
	});
});

describe('wallpaper.ts STORAGE_KEY', () => {
	it('matches the documented mills.* prefix so reset.ts sweeps it', () => {
		expect(STORAGE_KEY).toBe('mills.wallpaper.v1');
		expect(STORAGE_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('wallpaper.ts resolveWallpaper', () => {
	it('returns the default wallpaper for null', () => {
		expect(resolveWallpaper(null).id).toBe(defaultWallpaper().id);
	});

	it('returns the default wallpaper for unknown id', () => {
		expect(resolveWallpaper('does-not-exist').id).toBe(defaultWallpaper().id);
	});

	it('returns the matching wallpaper for a real id', () => {
		const real = wallpapers[1]?.id;
		expect(real).toBeDefined();
		expect(resolveWallpaper(real!).id).toBe(real);
	});
});

describe('wallpaper.ts applyToDocument', () => {
	beforeEach(() => {
		document.documentElement.style.removeProperty('--desktop-bg');
	});

	it('writes the --desktop-bg CSS variable', () => {
		const w = wallpapers[1];
		expect(w).toBeDefined();
		applyToDocument(w!);
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${w!.src}')`);
	});

	it('writing twice with different wallpapers replaces, not appends', () => {
		applyToDocument(wallpapers[0]!);
		applyToDocument(wallpapers[1]!);
		const value = document.documentElement.style.getPropertyValue('--desktop-bg');
		expect(value).toBe(`url('${wallpapers[1]!.src}')`);
	});
});

describe('wallpaper.ts getActiveId / setActiveId', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('round-trips through localStorage', () => {
		setActiveId('arizona');
		expect(getActiveId()).toBe('arizona');
	});

	it('returns null when localStorage.getItem throws', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
			throw new DOMException('SecurityError', 'SecurityError');
		});
		expect(getActiveId()).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
	});

	it('swallows setItem failures', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError', 'QuotaExceededError');
		});
		expect(() => setActiveId('arizona')).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});
});
