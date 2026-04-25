/*
 * PoW solver worker for /mail/. Iterates SHA-256 nonces from 0 until a
 * digest with `difficultyBits` leading zeros is found, then posts the
 * nonce back. Build-time emission picks the same first-satisfying nonce,
 * so main-thread decryption matches.
 */

import { sha256, leadingZeroBits } from './util/sha256';

interface SolveRequest {
	salt: string;
	difficultyBits: number;
}

interface SolveOk {
	ok: true;
	nonce: number;
	hashes: number;
	ms: number;
}
interface SolveFail {
	ok: false;
	hashes: number;
	ms: number;
}

const HARD_CAP = 1 << 24; // ~16M attempts; >>> our typical 16K target

self.addEventListener('message', (ev: MessageEvent<SolveRequest>) => {
	const { salt, difficultyBits } = ev.data;
	const enc = new TextEncoder();
	const start = performance.now();
	for (let n = 0; n < HARD_CAP; n++) {
		const hash = sha256(enc.encode(`${salt}:${n}`));
		if (leadingZeroBits(hash) >= difficultyBits) {
			const result: SolveOk = { ok: true, nonce: n, hashes: n + 1, ms: performance.now() - start };
			(self as unknown as Worker).postMessage(result);
			return;
		}
	}
	const fail: SolveFail = { ok: false, hashes: HARD_CAP, ms: performance.now() - start };
	(self as unknown as Worker).postMessage(fail);
});

export {};
