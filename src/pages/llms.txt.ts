import type { APIRoute } from 'astro';
import rawBody from '../data/llms.txt?raw';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');
	const body = rawBody.replaceAll('https://millsymills.com', origin);

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
