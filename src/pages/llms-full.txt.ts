import type { APIRoute } from 'astro';
import rawBody from '../data/llms-full.txt?raw';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms-full.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');
	const body = rawBody.replaceAll('https://millsymills.com', origin);

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
