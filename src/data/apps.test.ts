import { describe, expect, it } from 'vitest';
import { apps, findApp, isAppId } from './apps';

describe('apps metadata', () => {
	it('has unique ids', () => {
		const ids = apps.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has non-zero width and height for every app', () => {
		for (const app of apps) {
			expect(app.width, `${app.id}.width`).toBeGreaterThan(0);
			expect(app.height, `${app.id}.height`).toBeGreaterThan(0);
		}
	});

	it('keeps every ogDescription under 150 chars (JSDoc cap)', () => {
		for (const app of apps) {
			expect(
				app.ogDescription.length,
				`${app.id}.ogDescription is ${app.ogDescription.length} chars`,
			).toBeLessThan(150);
		}
	});

	it('has non-empty label, title, glyph, ogDescription on every app', () => {
		for (const app of apps) {
			expect(app.id, 'id').toMatch(/^[a-z][a-z0-9-]*$/);
			expect(app.label, `${app.id}.label`).not.toBe('');
			expect(app.title, `${app.id}.title`).not.toBe('');
			expect(app.glyph, `${app.id}.glyph`).not.toBe('');
			expect(app.ogDescription, `${app.id}.ogDescription`).not.toBe('');
		}
	});
});

describe('isAppId', () => {
	it('accepts every real id', () => {
		for (const app of apps) expect(isAppId(app.id)).toBe(true);
	});

	it('rejects non-ids and falsy inputs', () => {
		expect(isAppId('not-a-real-app')).toBe(false);
		expect(isAppId('')).toBe(false);
		expect(isAppId(undefined)).toBe(false);
		expect(isAppId(null)).toBe(false);
	});
});

describe('findApp', () => {
	it('returns the matching AppDef', () => {
		const about = findApp('about');
		expect(about?.id).toBe('about');
	});

	it('returns undefined for unknown ids', () => {
		expect(findApp('nope')).toBeUndefined();
	});
});
