import type { APIRoute } from 'astro';

// RFC 9116 security.txt — served from /.well-known/security.txt.
// All URLs derive from Astro.site so the file works across prod + rehearsal
// stacks (millsymills.com + p41m0n.com) without hardcoding.

export const GET: APIRoute = ({ site }) => {
	const origin = (site?.origin ?? 'https://millsymills.com').replace(/\/$/, '');

	// 12 months out from build time; refresh on every deploy.
	const expires = new Date();
	expires.setUTCFullYear(expires.getUTCFullYear() + 1);
	expires.setUTCHours(0, 0, 0, 0);

	const body = [
		`Contact: mailto:mills@millsymills.com`,
		`Encryption: ${origin}/pgp.asc`,
		`Expires: ${expires.toISOString()}`,
		`Canonical: ${origin}/.well-known/security.txt`,
		`Preferred-Languages: en`,
		'',
	].join('\n');

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
