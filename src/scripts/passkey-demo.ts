/*
 * External module so the production CSP `script-src 'self'` allows it.
 * See #129/#231 for the pattern.
 *
 * Real WebAuthn ceremonies against the demo Lambda (#446) fronted by
 * CloudFront at `/api/passkey/*` (#447/#630). The `/demo/passkey/*`
 * response-headers policy ships `publickey-credentials-create=(self)` /
 * `publickey-credentials-get=(self)` (infra/cloudfront.tf), so the
 * navigator.credentials.* calls run in production on this page only.
 *
 * Wire format is handled by `@simplewebauthn/browser`, the client companion
 * to the `@simplewebauthn/server` the Lambda verifies with — it produces the
 * exact base64url-encoded response JSON the server expects.
 */

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

const STORAGE_KEY = 'mills.passkey-demo.v1';
const API_BASE = '/api/passkey';

interface StoredCredential {
	readonly id: string;
	readonly displayName: string;
	readonly createdAt: string;
}

interface OptionsResponse<TOptions> {
	readonly sessionId: string;
	readonly options: TOptions;
}

interface VerifyResult {
	readonly verified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseOptionsResponse<TOptions>(data: unknown): OptionsResponse<TOptions> {
	if (isRecord(data) && typeof data.sessionId === 'string' && isRecord(data.options)) {
		return { sessionId: data.sessionId, options: data.options as TOptions };
	}
	throw new Error('server returned a malformed options response.');
}

function parseVerifyResult(data: unknown): VerifyResult {
	if (isRecord(data) && typeof data.verified === 'boolean') {
		return { verified: data.verified };
	}
	throw new Error('server returned a malformed verification response.');
}

async function postJSON<T>(path: string, body: unknown, parse: (data: unknown) => T): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API_BASE}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {}),
		});
	} catch {
		// A rejected fetch is a transport failure (offline, DNS, connection
		// refused, CloudFront mid-deploy), not a rejected passkey — surface
		// it as something the user can act on rather than "Failed to fetch".
		throw new Error('could not reach the passkey service — check your connection and retry.');
	}
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		// fall through to the status-based error below
	}
	if (!res.ok) {
		const reason =
			data && typeof data === 'object' && 'error' in data
				? String((data as { error: unknown }).error)
				: `request failed (${res.status})`;
		throw new Error(reason);
	}
	if (data == null) {
		throw new Error('server returned an unreadable response.');
	}
	return parse(data);
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
	// even on first write. The credential is already registered server-side at
	// this point; localStorage only backs the local label panel, so catch the
	// failure and let registration still report success rather than crashing it.
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
	writeStatus(status, 'busy', 'requesting options…');
	try {
		const { sessionId, options } = await postJSON('/registration/options', {}, (data) =>
			parseOptionsResponse<PublicKeyCredentialCreationOptionsJSON>(data),
		);

		writeStatus(status, 'busy', 'awaiting authenticator…');
		const response = await startRegistration({ optionsJSON: options });

		writeStatus(status, 'busy', 'verifying…');
		const result = await postJSON('/registration/verify', { sessionId, response }, parseVerifyResult);
		if (!result.verified) {
			writeStatus(status, 'err', 'server rejected the registration.');
			return;
		}

		const stored: StoredCredential = {
			id: response.id,
			displayName,
			createdAt: new Date().toISOString(),
		};
		if (!persistStored(stored)) {
			writeStatus(status, 'ok', `registered ${stored.id.slice(0, 12)}… (local view unavailable — private mode?)`);
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
	writeStatus(status, 'busy', 'requesting challenge…');
	try {
		const { sessionId, options } = await postJSON('/authentication/options', {}, (data) =>
			parseOptionsResponse<PublicKeyCredentialRequestOptionsJSON>(data),
		);

		writeStatus(status, 'busy', 'awaiting authenticator…');
		const response = await startAuthentication({ optionsJSON: options });

		writeStatus(status, 'busy', 'verifying…');
		const result = await postJSON('/authentication/verify', { sessionId, response }, parseVerifyResult);
		if (!result.verified) {
			writeStatus(status, 'err', 'server rejected the assertion.');
			return;
		}
		const stored = loadStored();
		const who = stored ? ` for "${stored.displayName}"` : '';
		writeStatus(status, 'ok', `verified${who}.`);
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

export {
	STORAGE_KEY,
	postJSON,
	loadStored,
	persistStored,
	clearStored,
	parseOptionsResponse,
	parseVerifyResult,
};
export type { StoredCredential, OptionsResponse, VerifyResult };
