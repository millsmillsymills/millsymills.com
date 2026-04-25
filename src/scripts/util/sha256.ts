/*
 * Synchronous SHA-256 (FIPS 180-4) for Web Workers + reveal-button paths
 * where `crypto.subtle.digest`'s async per-call overhead dominates the
 * inner PoW loop (we call it ~10K-100K times). Native code is faster, but
 * for our PoW iteration count the overhead of awaiting tens of thousands
 * of microtasks is what kills throughput, not the hash math itself.
 *
 * Used only by mail-pow.worker.ts and mail-pow.ts's button fallback —
 * not a general-purpose crypto primitive.
 */

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

export function sha256(input: Uint8Array): Uint8Array {
	// Pad to a multiple of 64 with: 0x80, zeros, 8-byte big-endian bit length.
	const bitLen = input.length * 8;
	const padLen = (input.length + 9 + 63) & ~63;
	const padded = new Uint8Array(padLen);
	padded.set(input);
	padded[input.length] = 0x80;
	const dv = new DataView(padded.buffer);
	// Inputs are bounded (<2^32 bits) for our PoW use; high 4 bytes stay 0.
	dv.setUint32(padLen - 4, bitLen >>> 0, false);

	const H = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
	]);
	const W = new Uint32Array(64);

	for (let i = 0; i < padLen; i += 64) {
		for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4, false);
		for (let t = 16; t < 64; t++) {
			const x15 = W[t - 15];
			const x2 = W[t - 2];
			const s0 = rotr(x15, 7) ^ rotr(x15, 18) ^ (x15 >>> 3);
			const s1 = rotr(x2, 17) ^ rotr(x2, 19) ^ (x2 >>> 10);
			W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
		}
		let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
		for (let t = 0; t < 64; t++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + maj) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + temp1) | 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) | 0;
		}
		H[0] = (H[0] + a) | 0;
		H[1] = (H[1] + b) | 0;
		H[2] = (H[2] + c) | 0;
		H[3] = (H[3] + d) | 0;
		H[4] = (H[4] + e) | 0;
		H[5] = (H[5] + f) | 0;
		H[6] = (H[6] + g) | 0;
		H[7] = (H[7] + h) | 0;
	}

	const out = new Uint8Array(32);
	const odv = new DataView(out.buffer);
	for (let t = 0; t < 8; t++) odv.setUint32(t * 4, H[t], false);
	return out;
}

/** Count leading zero bits in a SHA-256 digest. */
export function leadingZeroBits(bytes: Uint8Array): number {
	let zeros = 0;
	for (const b of bytes) {
		if (b === 0) {
			zeros += 8;
			continue;
		}
		let x = b;
		while ((x & 0x80) === 0) {
			zeros++;
			x <<= 1;
		}
		return zeros;
	}
	return zeros;
}
