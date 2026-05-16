import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isEnabled, setEnabled, SOURCES, STORAGE_KEY } from './system-sounds';

describe('system-sounds.ts STORAGE_KEY', () => {
	it('matches the mills.* prefix so reset.ts sweeps it', () => {
		expect(STORAGE_KEY).toBe('mills.sounds.enabled');
		expect(STORAGE_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('system-sounds.ts SOURCES', () => {
	it('covers every SoundKind with a /sounds/<file>.wav path', () => {
		const kinds: Array<keyof typeof SOURCES> = [
			'open',
			'close',
			'error',
			'startup',
			'reset',
		];
		for (const k of kinds) {
			expect(SOURCES[k]).toMatch(/^\/sounds\/[\w-]+\.wav$/);
		}
	});
});

describe('system-sounds.ts isEnabled / setEnabled', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('defaults to false when no value is set', () => {
		expect(isEnabled()).toBe(false);
	});

	it('round-trips true through localStorage', () => {
		setEnabled(true);
		expect(isEnabled()).toBe(true);
	});

	it('round-trips false through localStorage', () => {
		setEnabled(true);
		setEnabled(false);
		expect(isEnabled()).toBe(false);
	});

	it('treats any non-"1" stored value as disabled (no truthiness surprises)', () => {
		localStorage.setItem(STORAGE_KEY, 'yes');
		expect(isEnabled()).toBe(false);
		localStorage.setItem(STORAGE_KEY, 'true');
		expect(isEnabled()).toBe(false);
	});

	it('returns false when localStorage.getItem throws', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
			throw new DOMException('SecurityError', 'SecurityError');
		});
		expect(isEnabled()).toBe(false);
		expect(warn).toHaveBeenCalledOnce();
	});

	it('swallows setItem failures', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError', 'QuotaExceededError');
		});
		expect(() => setEnabled(true)).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});
});
