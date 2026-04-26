import type { APIRoute } from 'astro';
import { pgp } from '../../data/pgp';

// RFC 9116 security.txt — served from /.well-known/security.txt.
// All URLs derive from Astro.site so the file works across prod + rehearsal
// stacks (millsymills.com + p41m0n.com) without hardcoding.

export const GET: APIRoute = ({ site }) => {
	const origin = (site?.origin ?? 'https://millsymills.com').replace(/\/$/, '');
	// Derive Contact email domain from origin so rehearsal builds don't emit
	// a mixed-domain doc (Canonical: p41m0n.com, Contact: millsymills.com).
	const hostname = new URL(origin).hostname;

	// 12 months out from build time — use Date.UTC to avoid local-timezone drift
	// during a build that straddles UTC midnight in a non-UTC timezone.
	const now = new Date();
	const expiresUtc = new Date(
		Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
	);

	const body = [
		`Contact: mailto:mills@${hostname}`,
		`Encryption: ${origin}${pgp.downloadPath}`,
		`Policy: ${origin}/security/`,
		`Expires: ${expiresUtc.toISOString()}`,
		`Canonical: ${origin}/.well-known/security.txt`,
		`Preferred-Languages: en`,
		'',
	].join('\n');

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
