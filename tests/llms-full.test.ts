import { describe, expect, it } from 'vitest';
import { incidents } from '../src/data/incidents';
import { profile } from '../src/data/profile';
import { GET } from '../src/pages/llms-full.txt';

async function render(origin = 'https://millsymills.com/') {
	const response = await GET({ site: new URL(origin) } as Parameters<typeof GET>[0]);
	return { response, text: await response.text() };
}

describe('full site text', () => {
	it('serializes every canonical incident in source order with its public attribution and link', async () => {
		const { response, text } = await render();
		expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
		const stories = text.split('### notable war stories\n\n')[1]?.split('\n\n---')[0];
		if (!stories) throw new Error('missing notable war stories section');
		expect(stories.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(incidents.length);
		let previous = -1;
		for (const incident of incidents) {
			const index = stories.indexOf(incident.title);
			expect(index).toBeGreaterThan(previous);
			previous = index;
			expect(stories).toContain(`${incident.year}, ${incident.employer}`);
			expect(stories).toContain(incident.annotation);
			if (incident.link) {
				expect(stories).toContain(`[${incident.link.label}](${incident.link.href})`);
			}
		}
	});

	it('preserves the canonical location and profile GitHub links', async () => {
		const { text } = await render();
		expect(text).toContain(`Location: ${profile.location}.`);
		expect(text).toContain(`Open source, across <${profile.github}> and\n<${profile.githubOrg}>:`);
	});

	it('keeps canonical-site rewriting and external evidence links intact', async () => {
		const { text } = await render('https://example.test/');
		expect(text).toContain('<https://example.test/files/resume.md>');
		for (const incident of incidents) {
			if (incident.link) expect(text).toContain(incident.link.href);
		}
	});
});
