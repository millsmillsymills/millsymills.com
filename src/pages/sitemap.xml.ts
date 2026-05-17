import type { APIRoute } from 'astro';
import { apps } from '../data/apps';

const SITE = 'https://millsymills.com';

// Build-time stamp shared across every <url> in the sitemap. The whole
// dist/ tree is rebuilt + redeployed on every push or monthly schedule,
// so "this page was last touched at build time" is true at first order
// for a static site — finer per-route lastmod (git-blame derived) would
// be overkill for a portfolio whose routes turn over together.
const LASTMOD = new Date().toISOString().slice(0, 10);

export const GET: APIRoute = () => {
	const origin = SITE;

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
    <lastmod>${LASTMOD}</lastmod>
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
