/*
 * /mail/ proof-of-work email reveal.
 *
 * The address is XOR-encrypted at build time with a key derived from a
 * SHA-256 PoW nonce; this module spawns a Worker (mail-pow.worker.ts) to
 * re-derive the nonce, then decrypts and replaces the placeholder.
 *
 * Two failure paths land on the same fallback button:
 *   - Workers unavailable (older browsers, strict CSP) → button shown
 *     immediately, caller solves on the main thread when clicked
 *   - Worker takes too long (> WORKER_TIMEOUT_MS) → button shown, same path
 *
 * Decryption is XOR-with-key (key = SHA-256(salt:nonce:key)). Not a
 * security control — it just keeps the email out of the static HTML.
 */

import { sha256, leadingZeroBits } from './util/sha256';
import { installDefaultTrustedTypesPolicy } from './util/trusted-types';
import MailPowWorker from './mail-pow.worker?worker';

interface Manifest {
	readonly salt: string;
	readonly difficultyBits: number;
	readonly encryptedB64: string;
}

const WORKER_TIMEOUT_MS = 5000;
const HARD_CAP = 1 << 24;

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function decryptEmail(manifest: Manifest, nonce: number): string {
	const enc = new TextEncoder();
	const key = sha256(enc.encode(`${manifest.salt}:${nonce}:key`));
	const cipher = base64ToBytes(manifest.encryptedB64);
	const out = new Uint8Array(cipher.length);
	for (let i = 0; i < cipher.length; i++) out[i] = (cipher[i] ?? 0) ^ (key[i % key.length] ?? 0);
	return new TextDecoder().decode(out);
}

/** Synchronous PoW for the fallback path. Blocks the UI; only used on click. */
function solveSync(salt: string, bits: number): number | null {
	const enc = new TextEncoder();
	for (let n = 0; n < HARD_CAP; n++) {
		const hash = sha256(enc.encode(`${salt}:${n}`));
		if (leadingZeroBits(hash) >= bits) return n;
	}
	return null;
}

/** Reveal one link with the decrypted email. Idempotent per link. */
function revealLink(link: HTMLAnchorElement, email: string): void {
	if (link.dataset['powState'] === 'done') return;
	const subject = link.dataset['mailSubject'] ?? '';
	link.href = subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
	link.textContent = email;
	link.dataset['powState'] = 'done';
	const fallback = link.parentElement?.querySelector<HTMLButtonElement>('[data-mail-pow-reveal]');
	if (fallback) fallback.hidden = true;
}

function showFallbacks(label = 'reveal email'): void {
	for (const fallback of document.querySelectorAll<HTMLButtonElement>('[data-mail-pow-reveal]')) {
		if (fallback.hidden === false) continue; // already showing
		fallback.textContent = label;
		fallback.hidden = false;
		fallback.disabled = false;
	}
}

export function initMailPow(): void {
	const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-mail-pow-link]'));
	if (!links.length) return;

	const manifest = import.meta.env.PUBLIC_MAIL_POW;
	if (!manifest) {
		for (const link of links) link.textContent = 'mail unavailable';
		return;
	}

	function revealAll(nonce: number): void {
		const email = decryptEmail(manifest, nonce);
		for (const link of links) revealLink(link, email);
	}

	let worker: Worker | null = null;
	let timeoutId: number | null = null;
	try {
		installDefaultTrustedTypesPolicy();
		worker = new MailPowWorker();
	} catch (err) {
		console.warn('[mail-pow] worker spawn failed; offering manual fallback', err);
		showFallbacks();
	}

	if (worker) {
		const w = worker;
		timeoutId = window.setTimeout(() => {
			console.warn('[mail-pow] worker timeout; offering manual fallback');
			w.terminate();
			worker = null;
			showFallbacks();
		}, WORKER_TIMEOUT_MS);

		w.addEventListener('message', (ev: MessageEvent) => {
			if (timeoutId !== null) window.clearTimeout(timeoutId);
			w.terminate();
			worker = null;
			const data = ev.data as { ok: boolean; nonce?: number };
			if (data.ok && typeof data.nonce === 'number') {
				revealAll(data.nonce);
			} else {
				showFallbacks();
			}
		});
		w.postMessage({ salt: manifest.salt, difficultyBits: manifest.difficultyBits });
	}

	// Fallback buttons solve on the main thread when clicked. Any one of
	// them solving reveals every link on the page.
	for (const fallback of document.querySelectorAll<HTMLButtonElement>('[data-mail-pow-reveal]')) {
		fallback.addEventListener('click', () => {
			for (const fb of document.querySelectorAll<HTMLButtonElement>('[data-mail-pow-reveal]')) {
				fb.disabled = true;
				fb.textContent = 'solving…';
			}
			requestAnimationFrame(() => {
				const nonce = solveSync(manifest.salt, manifest.difficultyBits);
				if (nonce === null) {
					for (const fb of document.querySelectorAll<HTMLButtonElement>('[data-mail-pow-reveal]')) {
						fb.textContent = 'failed — refresh the page';
					}
					return;
				}
				revealAll(nonce);
			});
		});
	}
}
