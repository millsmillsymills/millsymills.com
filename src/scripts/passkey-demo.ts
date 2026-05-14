/*
 * External module so the production CSP `script-src 'self'` allows it.
 * See #129/#231 for the pattern.
 *
 * Permissions-Policy in production ships `publickey-credentials-create=()`
 * and `publickey-credentials-get=()`, which blocks both calls at the
 * browser level. The demo only operates end-to-end in dev or once the
 * CloudFront slice extends those directives to `=(self)` for this page.
 * See `infra/cloudfront.tf` and `src/data/security-controls.ts`.
 */

const STORAGE_KEY = 'mills.passkey-demo.v1';
const RP_NAME = 'mills passkey demo';
const TIMEOUT_MS = 60_000;

interface StoredCredential {
	readonly id: string;
	readonly displayName: string;
	readonly createdAt: string;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of view) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array<ArrayBuffer> {
	// A base64 string never has length 4k+1 (every 3 input bytes -> 4 chars);
	// only 4k+2 and 4k+3 need padding. atob throws on malformed input, which
	// the caller's try/catch surfaces as a status error.
	const rem = s.length % 4;
	const pad = rem === 2 ? '==' : rem === 3 ? '=' : '';
	const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
	const buf = new Uint8Array(new ArrayBuffer(n));
	crypto.getRandomValues(buf);
	return buf;
}

function loadStored(): StoredCredential | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredCredential;
		if (typeof parsed?.id === 'string' && typeof parsed?.displayName === 'string') {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function persistStored(cred: StoredCredential): boolean {
	// Safari private-mode and some locked-down WebViews throw QuotaExceededError
	// even on first write — surface the failure rather than letting it bubble
	// through navigator.credentials' catch path and produce a misleading
	// "register failed" message.
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cred));
		return true;
	} catch {
		return false;
	}
}

function clearStored(): void {
	localStorage.removeItem(STORAGE_KEY);
}

function writeStatus(el: HTMLElement, kind: 'idle' | 'ok' | 'err' | 'busy', msg: string): void {
	el.dataset.state = kind;
	el.textContent = msg;
}

function refreshStoredView(view: HTMLElement, clearBtn: HTMLButtonElement): void {
	const stored = loadStored();
	if (stored) {
		view.dataset.state = 'present';
		view.textContent = `credential ${stored.id.slice(0, 12)}… for "${stored.displayName}" (created ${stored.createdAt})`;
		clearBtn.disabled = false;
	} else {
		view.dataset.state = 'empty';
		view.textContent = 'no credential registered yet.';
		clearBtn.disabled = true;
	}
}

async function handleRegister(displayName: string, status: HTMLElement): Promise<void> {
	if (!window.PublicKeyCredential) {
		writeStatus(status, 'err', 'webauthn not supported in this browser.');
		return;
	}
	writeStatus(status, 'busy', 'awaiting authenticator…');
	const challenge = randomBytes(32);
	const userId = randomBytes(16);
	const options: PublicKeyCredentialCreationOptions = {
		challenge,
		rp: { name: RP_NAME, id: location.hostname },
		user: {
			id: userId,
			name: `${displayName}@demo.local`,
			displayName,
		},
		pubKeyCredParams: [
			{ type: 'public-key', alg: -7 },
			{ type: 'public-key', alg: -257 },
		],
		authenticatorSelection: {
			userVerification: 'preferred',
			residentKey: 'preferred',
		},
		attestation: 'none',
		timeout: TIMEOUT_MS,
	};
	try {
		const cred = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential | null;
		if (!cred) {
			writeStatus(status, 'err', 'register cancelled.');
			return;
		}
		const stored: StoredCredential = {
			id: base64UrlEncode(cred.rawId),
			displayName,
			createdAt: new Date().toISOString(),
		};
		if (!persistStored(stored)) {
			writeStatus(status, 'err', 'registered but localStorage is blocked (private mode?). cannot persist.');
			return;
		}
		writeStatus(status, 'ok', `registered. credential id ${stored.id.slice(0, 12)}…`);
	} catch (err) {
		writeStatus(status, 'err', `register failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

async function handleAuthenticate(status: HTMLElement): Promise<void> {
	if (!window.PublicKeyCredential) {
		writeStatus(status, 'err', 'webauthn not supported in this browser.');
		return;
	}
	const stored = loadStored();
	if (!stored) {
		writeStatus(status, 'err', 'no credential registered — register first.');
		return;
	}
	writeStatus(status, 'busy', 'awaiting authenticator…');
	const challenge = randomBytes(32);
	const options: PublicKeyCredentialRequestOptions = {
		challenge,
		rpId: location.hostname,
		allowCredentials: [
			{
				id: base64UrlDecode(stored.id),
				type: 'public-key',
			},
		],
		userVerification: 'preferred',
		timeout: TIMEOUT_MS,
	};
	try {
		const assertion = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential | null;
		if (!assertion) {
			writeStatus(status, 'err', 'authenticate cancelled.');
			return;
		}
		const returnedId = base64UrlEncode(assertion.rawId);
		if (returnedId !== stored.id) {
			writeStatus(status, 'err', 'credential id mismatch (mock verification failed).');
			return;
		}
		writeStatus(status, 'ok', `verified. assertion for ${stored.displayName}.`);
	} catch (err) {
		writeStatus(status, 'err', `authenticate failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

function init(): void {
	const root = document.querySelector<HTMLElement>('[data-passkey-demo]');
	if (!root) return;

	const registerBtn = root.querySelector<HTMLButtonElement>('[data-action="register"]');
	const authBtn = root.querySelector<HTMLButtonElement>('[data-action="authenticate"]');
	const clearBtn = root.querySelector<HTMLButtonElement>('[data-action="clear"]');
	const nameInput = root.querySelector<HTMLInputElement>('[data-passkey-name]');
	const registerStatus = root.querySelector<HTMLElement>('[data-status="register"]');
	const authStatus = root.querySelector<HTMLElement>('[data-status="authenticate"]');
	const storedView = root.querySelector<HTMLElement>('[data-stored-view]');

	if (
		!registerBtn || !authBtn || !clearBtn || !nameInput ||
		!registerStatus || !authStatus || !storedView
	) {
		return;
	}

	refreshStoredView(storedView, clearBtn);

	registerBtn.addEventListener('click', async () => {
		const displayName = nameInput.value.trim() || 'demo user';
		registerBtn.disabled = true;
		authBtn.disabled = true;
		try {
			await handleRegister(displayName, registerStatus);
			refreshStoredView(storedView, clearBtn);
		} finally {
			registerBtn.disabled = false;
			authBtn.disabled = false;
		}
	});

	authBtn.addEventListener('click', async () => {
		registerBtn.disabled = true;
		authBtn.disabled = true;
		try {
			await handleAuthenticate(authStatus);
		} finally {
			registerBtn.disabled = false;
			authBtn.disabled = false;
		}
	});

	clearBtn.addEventListener('click', () => {
		clearStored();
		refreshStoredView(storedView, clearBtn);
		writeStatus(registerStatus, 'idle', '');
		writeStatus(authStatus, 'idle', '');
	});
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
