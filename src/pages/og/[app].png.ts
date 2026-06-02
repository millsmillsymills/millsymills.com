import type { APIRoute } from 'astro';
import { renderCard } from '@mills/graphics-tools';
import { apps } from '../../data/apps';

export function getStaticPaths() {
	// Match sitemap.xml.ts + llms.txt.ts: hidden apps are off-discovery, so
	// no shared OG image needed for them either.
	return apps.filter((a) => !a.hidden).map((a) => ({ params: { app: a.id } }));
}

// SVG og:image is silently rejected by Twitter/X, Facebook, LinkedIn, Slack,
// Discord, iMessage — they require raster for previews. @mills/graphics-tools
// composes the vaporwave card and rasterizes it to PNG at build time.
export const GET: APIRoute = ({ params }) => {
	const app = apps.find((a) => a.id === params.app);
	if (!app) return new Response('not found', { status: 404 });

	const png = renderCard({
		title: app.title,
		label: app.label,
		description: app.ogDescription,
		brandLine: 'mills · millsymills.com',
	});

	return new Response(png, {
		status: 200,
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
