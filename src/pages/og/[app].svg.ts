import type { APIRoute } from 'astro';
import { apps } from '../../data/apps';

export function getStaticPaths() {
	return apps.map((a) => ({ params: { app: a.id } }));
}

export const GET: APIRoute = ({ params }) => {
	const id = params.app;
	const app = apps.find((a) => a.id === id);
	if (!app) return new Response('not found', { status: 404 });

	// Escape < > & in content that lands inside SVG text nodes.
	const esc = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	const title = esc(app.title);
	const label = esc(app.label);
	const description = esc(app.ogDescription);

	// Wrap the description onto multiple lines (rough word-based wrap at ~52 chars).
	const words = description.split(/\s+/);
	const lines: string[] = [];
	let line = '';
	for (const w of words) {
		if ((line + ' ' + w).trim().length > 52) {
			if (line) lines.push(line);
			line = w;
		} else {
			line = (line ? line + ' ' : '') + w;
		}
	}
	if (line) lines.push(line);
	const clipped = lines.slice(0, 3);
	if (lines.length > 3) clipped[2] = clipped[2].replace(/[.,;]?\s*$/, '…');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7ec0"/>
      <stop offset="1" stop-color="#e62b8c"/>
    </linearGradient>
    <pattern id="tile" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M0 0 L24 24 L0 48 M24 0 L48 24 L24 48" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#tile)"/>

  <!-- sparkles -->
  <g fill="rgba(255,255,255,0.7)" font-family="monospace" font-size="36">
    <text x="80" y="120" transform="rotate(-8 80 120)">✦ ✧ ⋆</text>
    <text x="900" y="560" transform="rotate(7 900 560)">⋆ ✧ ✦</text>
  </g>

  <!-- window chrome -->
  <g transform="translate(90 150)">
    <rect width="1020" height="340" rx="14" fill="#fff9f3" stroke="#321a44" stroke-width="4"/>
    <rect width="1020" height="48" rx="14" fill="#e62b8c"/>
    <rect y="34" width="1020" height="14" fill="#e62b8c"/>
    <rect x="0" y="46" width="1020" height="4" fill="#321a44"/>
    <g font-family="'Press Start 2P', monospace" font-size="14" fill="#fff9f3" letter-spacing="1">
      <text x="24" y="32">${title}</text>
    </g>
    <g transform="translate(940 10)">
      <rect width="24" height="26" rx="4" fill="#fff9f3" stroke="#321a44" stroke-width="2"/>
      <rect x="28" width="24" height="26" rx="4" fill="#fff9f3" stroke="#321a44" stroke-width="2"/>
      <rect x="56" width="24" height="26" rx="4" fill="#fff9f3" stroke="#321a44" stroke-width="2"/>
    </g>

    <g transform="translate(40 110)" fill="#1a0e23">
      <text font-family="'Press Start 2P', monospace" font-size="44" fill="#b6196d" letter-spacing="2">
        ${label}
      </text>
      <g font-family="monospace" font-size="26" fill="#4a3257">
        ${clipped
					.map((l, i) => `<text x="0" y="${90 + i * 36}">${l}</text>`)
					.join('\n        ')}
      </g>
    </g>
  </g>

  <!-- footer -->
  <g font-family="'Press Start 2P', monospace" font-size="16" fill="#fff9f3" letter-spacing="2">
    <text x="90" y="580">mills · millsymills.com</text>
  </g>
</svg>
`;

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
