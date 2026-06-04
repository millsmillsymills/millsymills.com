import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
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
		expect(parsed.options.challenge).toBe('c');
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
