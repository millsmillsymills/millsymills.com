import type { APIRoute } from 'astro';
import { apps } from '../data/apps';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('sitemap.xml: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	// site.href ends with a trailing slash; strip it so paths we concatenate
	// don't produce double slashes.
	const origin = site.href.replace(/\/$/, '');

	const urls = [
		{ loc: `${origin}/`, priority: '1.0', changefreq: 'monthly' },
		...apps
			.filter((a) => !a.hidden)
			.map((a) => ({
				loc: `${origin}/${a.id}/`,
				priority: '0.8',
				changefreq: 'monthly',
			})),
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
	)
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
};
