/*
 * PGP key metadata. Single source of truth — About.astro, Mail.astro, and
 * the `pubkey` terminal command all read from here. On key rotation:
 *   1. Re-run ./scripts/generate-wkd.sh
 *   2. Overwrite public/pgp.asc
 *   3. Update the fields below
 *   4. Commit all four changes in one PR
 */

export const pgp = {
	/** 40-char hex fingerprint with standard group-of-4 spacing, double-space between halves */
	fingerprint: '0BD8 E33B E4A6 372D B679  E77D 60AA A2D2 D8A2 DC66',
	/** last 8 chars of the fingerprint (no spaces) */
	shortId: 'D8A2DC66',
	/** ISO yyyy-mm-dd */
	createdAt: '2026-04-21',
	/** ISO yyyy-mm-dd */
	expiresAt: '2030-04-21',
	/** path where the armored key is served, relative to the origin */
	downloadPath: '/pgp.asc',
	/** email address associated with the key */
	email: 'mills@millsymills.com',
} as const;
