/*
 * PGP + age key metadata. Single source of truth — About.astro, Mail.astro,
 * and the `pubkey` terminal command all read from here.
 *
 * On PGP rotation:
 *   1. Re-run ./scripts/generate-wkd.sh
 *   2. Overwrite public/pgp.asc
 *   3. Update the PGP fields below
 *   4. Commit all four changes in one PR
 *
 * On age rotation (or first activation):
 *   1. Generate a keypair: `age-keygen -o ~/age-mills.txt`
 *   2. Drop the public recipient (the `age1...` line) into public/age.pub
 *   3. Update `age` below — `recipient` must match public/age.pub exactly
 *   4. Commit; assert-pgp-consistency.sh enforces the match
 */

interface AgeKey {
	/** Single `age1...` recipient string. Must match public/age.pub exactly. */
	recipient: string;
	/** ISO yyyy-mm-dd */
	createdAt: string;
}

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
	/**
	 * age recipient. Must match public/age.pub exactly — `assert-pgp-consistency.sh`
	 * enforces the match. Generated 2026-05-21; rotate per the header comment.
	 */
	age: {
		recipient: 'age1m855p6cpw3chaqjvgn94kscs3s4ff5jrpd35sgyc3u8upymylcvs2hsac0',
		createdAt: '2026-05-21',
	} as AgeKey | undefined,
	/** path where the age recipient is served, relative to the origin */
	ageDownloadPath: '/age.pub',
} as const;
