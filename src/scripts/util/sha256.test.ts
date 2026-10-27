import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { leadingZeroBits, sha256 } from './sha256';

describe('mail proof-of-work hash', () => {
	it.each([0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1024])(
		'matches the native SHA-256 implementation for %i input bytes',
		(length) => {
			// Nonuniform bytes exercise padding boundaries and multi-block input.
			const input = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
			const original = input.slice();
			const expected = createHash('sha256').update(input).digest('hex');

			expect(Buffer.from(sha256(input)).toString('hex')).toBe(expected);
			expect(input).toEqual(original);
		},
	);

	it('hashes UTF-8 nonce messages identically to the native implementation', () => {
		const input = new TextEncoder().encode('mail-salt:16384:key');
		expect(Buffer.from(sha256(input)).toString('hex'))
			.toBe(createHash('sha256').update(input).digest('hex'));
	});
});

describe('proof-of-work difficulty', () => {
	it.each([
		{ bytes: [], expected: 0 },
		{ bytes: [0x80], expected: 0 },
		{ bytes: [0x40], expected: 1 },
		{ bytes: [0x01], expected: 7 },
		{ bytes: [0x00, 0x08, 0x00], expected: 12 },
		{ bytes: [0x00, 0x00, 0x01], expected: 23 },
		{ bytes: [0x00, 0x00], expected: 16 },
	])('counts $expected leading zero bits in $bytes', ({ bytes, expected }) => {
		expect(leadingZeroBits(Uint8Array.from(bytes))).toBe(expected);
	});
});
