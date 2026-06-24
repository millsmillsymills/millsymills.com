import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/browser', () => ({
	startRegistration: vi.fn(),
	startAuthentication: vi.fn(),
}));

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import {
	clearStored,
	handleAuthenticate,
	handleRegister,
	loadStored,
	parseOptionsResponse,
	parseVerifyResult,
	persistStored,
	postJSON,
	STORAGE_KEY,
} from './passkey-demo';

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as unknown as Response;
}

function unparsableResponse(status: number): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => {
			throw new SyntaxError('Unexpected token < in JSON');
		},
	} as unknown as Response;
}

const identity = (data: unknown): unknown => data;

const mockStartRegistration = vi.mocked(startRegistration);
const mockStartAuthentication = vi.mocked(startAuthentication);

// Route a stubbed fetch by request path → response, so the two-step
// options-then-verify ceremony in the handlers can be driven per leg.
function routedFetch(routes: Record<string, Response>): typeof fetch {
	return vi.fn(async (url: string) => {
		const path = String(url).replace('/api/passkey', '');
		const res = routes[path];
		if (!res) throw new Error(`unexpected fetch ${url}`);
		return res;
	}) as unknown as typeof fetch;
}

beforeEach(() => {
	(window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = class {};
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	localStorage.clear();
	delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
});

describe('postJSON', () => {
	it('parses a 2xx body through the provided parser', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { sessionId: 's', options: {} })));
		const result = await postJSON('/registration/options', {}, (data) =>
			parseOptionsResponse<Record<string, unknown>>(data),
		);
		expect(result.sessionId).toBe('s');
	});

	it('rethrows a transport failure as an actionable message', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			}),
		);
		await expect(postJSON('/x', {}, identity)).rejects.toThrow(/could not reach the passkey service/);
	});

	it('surfaces the server error envelope on a non-2xx response', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { error: 'forbidden' })));
		await expect(postJSON('/x', {}, identity)).rejects.toThrow('forbidden');
	});

	it('falls back to a status message when a non-2xx body is unparsable', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => unparsableResponse(502)));
		await expect(postJSON('/x', {}, identity)).rejects.toThrow('request failed (502)');
	});

	it('falls back to a status message when a parsed non-2xx body has no error field', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { message: 'oops' })));
		await expect(postJSON('/x', {}, identity)).rejects.toThrow('request failed (500)');
	});

	it('rejects a 2xx response with an unreadable body', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => unparsableResponse(200)));
		await expect(postJSON('/x', {}, identity)).rejects.toThrow(/unreadable response/);
	});

	it('lets the parser reject a malformed 2xx shape', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { unexpected: true })));
		await expect(postJSON('/x', {}, parseVerifyResult)).rejects.toThrow(/malformed verification response/);
	});
});

describe('parseOptionsResponse', () => {
	it('returns the envelope when sessionId is a string and options is an object', () => {
		const parsed = parseOptionsResponse<Record<string, unknown>>({ sessionId: 'abc', options: { challenge: 'c' } });
		expect(parsed.sessionId).toBe('abc');
		expect(parsed.options['challenge']).toBe('c');
	});

	it('throws when sessionId is missing', () => {
		expect(() => parseOptionsResponse({ options: {} })).toThrow(/malformed options response/);
	});

	it('throws when options is not an object', () => {
		expect(() => parseOptionsResponse({ sessionId: 's', options: 'nope' })).toThrow(/malformed options response/);
	});
});

describe('parseVerifyResult', () => {
	it('keeps only verified, ignoring extra server fields', () => {
		expect(parseVerifyResult({ verified: true, userHandle: 'uh' })).toEqual({ verified: true });
	});

	it('throws when verified is not a boolean', () => {
		expect(() => parseVerifyResult({ verified: 'true' })).toThrow(/malformed verification response/);
	});
});

describe('loadStored', () => {
	it('returns null when nothing is stored', () => {
		expect(loadStored()).toBeNull();
	});

	it('returns the credential for a well-formed entry', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'i', displayName: 'd', createdAt: 't' }));
		expect(loadStored()?.id).toBe('i');
	});

	it('returns null for malformed JSON', () => {
		localStorage.setItem(STORAGE_KEY, '{not json');
		expect(loadStored()).toBeNull();
	});

	it('returns null when required fields are not strings', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 1, displayName: 'd' }));
		expect(loadStored()).toBeNull();
	});
});

describe('persistStored', () => {
	const cred = { id: 'i', displayName: 'd', createdAt: 't' } as const;

	it('writes and reports success', () => {
		expect(persistStored(cred)).toBe(true);
		expect(loadStored()?.id).toBe('i');
	});

	it('reports failure on QuotaExceededError instead of throwing (private mode)', () => {
		const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError');
		});
		try {
			expect(persistStored(cred)).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('clearStored', () => {
	it('removes the entry and reports success', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'i', displayName: 'd', createdAt: 't' }));
		expect(clearStored()).toBe(true);
		expect(loadStored()).toBeNull();
	});

	it('reports failure instead of throwing when removeItem throws (locked-down browser)', () => {
		const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		try {
			expect(clearStored()).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('handleRegister', () => {
	const optionsLeg = () => jsonResponse(200, { sessionId: 's', options: { challenge: 'c' } });

	it('runs the ceremony and reports the credential id on success', async () => {
		vi.stubGlobal('fetch', routedFetch({
			'/registration/options': optionsLeg(),
			'/registration/verify': jsonResponse(200, { verified: true }),
		}));
		mockStartRegistration.mockResolvedValue({ id: 'credential-abc123456789' } as never);
		const status = document.createElement('div');

		await handleRegister('alice', status);

		expect(status.dataset['state']).toBe('ok');
		expect(status.textContent).toContain('registered');
		expect(loadStored()?.id).toBe('credential-abc123456789');
	});

	it('still reports success when localStorage is blocked (credential is already server-side)', async () => {
		vi.stubGlobal('fetch', routedFetch({
			'/registration/options': optionsLeg(),
			'/registration/verify': jsonResponse(200, { verified: true }),
		}));
		mockStartRegistration.mockResolvedValue({ id: 'credential-abc123456789' } as never);
		const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError');
		});
		const status = document.createElement('div');
		try {
			await handleRegister('alice', status);
		} finally {
			spy.mockRestore();
		}

		expect(status.dataset['state']).toBe('ok');
		expect(status.textContent).toContain('local view unavailable');
	});

	it('reports an error when the server returns verified:false', async () => {
		vi.stubGlobal('fetch', routedFetch({
			'/registration/options': optionsLeg(),
			'/registration/verify': jsonResponse(200, { verified: false }),
		}));
		mockStartRegistration.mockResolvedValue({ id: 'x' } as never);
		const status = document.createElement('div');

		await handleRegister('alice', status);

		expect(status.dataset['state']).toBe('err');
		expect(status.textContent).toContain('server rejected the registration');
	});

	it('surfaces a transport failure through the catch', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
		const status = document.createElement('div');

		await handleRegister('alice', status);

		expect(status.dataset['state']).toBe('err');
		expect(status.textContent).toContain('register failed');
	});

	it('reports unsupported when PublicKeyCredential is absent', async () => {
		delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
		const status = document.createElement('div');

		await handleRegister('alice', status);

		expect(status.dataset['state']).toBe('err');
		expect(status.textContent).toContain('not supported');
	});
});

describe('handleAuthenticate', () => {
	const optionsLeg = () => jsonResponse(200, { sessionId: 's', options: { challenge: 'c' } });

	it('reports the stored display name on success', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'i', displayName: 'alice', createdAt: 't' }));
		vi.stubGlobal('fetch', routedFetch({
			'/authentication/options': optionsLeg(),
			'/authentication/verify': jsonResponse(200, { verified: true }),
		}));
		mockStartAuthentication.mockResolvedValue({ id: 'i' } as never);
		const status = document.createElement('div');

		await handleAuthenticate(status);

		expect(status.dataset['state']).toBe('ok');
		expect(status.textContent).toContain('alice');
	});

	it('verifies discoverable credentials with no local record (loadStored null)', async () => {
		vi.stubGlobal('fetch', routedFetch({
			'/authentication/options': optionsLeg(),
			'/authentication/verify': jsonResponse(200, { verified: true }),
		}));
		mockStartAuthentication.mockResolvedValue({ id: 'i' } as never);
		const status = document.createElement('div');

		await handleAuthenticate(status);

		expect(status.dataset['state']).toBe('ok');
		expect(status.textContent).toBe('verified.');
	});

	it('reports an error when the server returns verified:false', async () => {
		vi.stubGlobal('fetch', routedFetch({
			'/authentication/options': optionsLeg(),
			'/authentication/verify': jsonResponse(200, { verified: false }),
		}));
		mockStartAuthentication.mockResolvedValue({ id: 'i' } as never);
		const status = document.createElement('div');

		await handleAuthenticate(status);

		expect(status.dataset['state']).toBe('err');
		expect(status.textContent).toContain('server rejected the assertion');
	});
});
