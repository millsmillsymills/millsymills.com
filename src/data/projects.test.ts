import { describe, expect, it } from 'vitest';
import { findProject, projects } from './projects';

describe('projects metadata', () => {
	it('has unique ids', () => {
		const ids = projects.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has non-empty name, tagline, description, repo on every project', () => {
		for (const p of projects) {
			expect(p.id, 'id').toMatch(/^[a-z][a-z0-9-]*$/);
			expect(p.name, `${p.id}.name`).not.toBe('');
			expect(p.tagline, `${p.id}.tagline`).not.toBe('');
			expect(p.description, `${p.id}.description`).not.toBe('');
			expect(p.repo, `${p.id}.repo`).toMatch(/^https:\/\//);
		}
	});
});

describe('findProject', () => {
	it('returns the matching Project', () => {
		const site = findProject('millsymills-com');
		expect(site?.id).toBe('millsymills-com');
	});

	it('returns undefined for unknown ids', () => {
		expect(findProject('nope')).toBeUndefined();
	});
});
