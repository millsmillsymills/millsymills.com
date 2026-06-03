import type { APIRoute } from 'astro';
import { pgp } from '../../data/pgp';

// RFC 9116 security.txt — served from /.well-known/security.txt.
// All URLs derive from Astro.site so the file stays correct without
// hardcoding the canonical domain.

export const GET: APIRoute = ({ site }) => {
	const origin = (site?.origin ?? 'https://millsymills.com').replace(/\/$/, '');
	// Derive the Contact email domain from the origin so the doc never
	// emits a mixed-domain pair (Canonical vs Contact on different hosts).
	const hostname = new URL(origin).hostname;

	// 12 months out from build time — use Date.UTC to avoid local-timezone drift
	// during a build that straddles UTC midnight in a non-UTC timezone.
	const now = new Date();
	const expiresUtc = new Date(
		Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
	);

	const body = [
		`Contact: mailto:security@${hostname}`,
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
