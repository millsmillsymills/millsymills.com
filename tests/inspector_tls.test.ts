import { describe, expect, it } from 'vitest';

import { handler } from '../infra/inspector_tls.mjs';

type LambdaResponse = {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
};

function invoke(headers: Record<string, string>): Promise<LambdaResponse> {
	return handler({ headers }) as Promise<LambdaResponse>;
}

function bodyOf(res: LambdaResponse): Record<string, unknown> {
	return JSON.parse(res.body) as Record<string, unknown>;
}

describe('inspector_tls handler', () => {
	it('parses a well-formed cloudfront-viewer-tls header', async () => {
		const res = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com',
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
		expect(res.headers['cache-control']).toBe('no-store');
		const body = bodyOf(res);
		expect(body.protocol).toBe('TLSv1.3');
		expect(body.cipher).toBe('TLS_AES_256_GCM_SHA384');
		expect(body.sni).toBe('millsymills.com');
	});

	it('returns 403 when the cloudfront-viewer-tls header is missing', async () => {
		const res = await invoke({});
		expect(res.statusCode).toBe(403);
		expect(bodyOf(res)).toEqual({ error: 'missing cloudfront-viewer-tls' });
	});

	it('returns 403 when the cloudfront-viewer-tls header is empty', async () => {
		const res = await invoke({ 'cloudfront-viewer-tls': '' });
		expect(res.statusCode).toBe(403);
	});

	it('does not reflect the raw header in the response body', async () => {
		const res = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com',
		});
		const body = bodyOf(res);
		expect(body).not.toHaveProperty('raw');
	});

	it('drops control characters and non-token bytes from each component', async () => {
		const res = await invoke({
			'cloudfront-viewer-tls': "TLSv1.3:CIPHER\nINJECT:</script><img>alert(1)",
		});
		expect(res.statusCode).toBe(200);
		const body = bodyOf(res);
		expect(body.protocol).toBe('TLSv1.3');
		// Both attacker-controlled components fail the [A-Za-z0-9._-]{0,128}
		// shape and are blanked out, not reflected.
		expect(body.cipher).toBe('');
		expect(body.sni).toBe('');
	});

	it('caps the raw header at 256 bytes before parsing', async () => {
		const longProtocol = 'A'.repeat(300);
		const res = await invoke({
			'cloudfront-viewer-tls': `${longProtocol}:cipher:sni`,
		});
		expect(res.statusCode).toBe(200);
		const body = bodyOf(res);
		// Two defenses cooperate: the raw header is sliced to 256 bytes
		// (so cipher/sni past the truncation point disappear), and each
		// surviving component is rejected by the {0,128} length cap in
		// the regex. The 'A'.repeat(300) protocol component fails both —
		// it exceeds 128 chars even after the 256-byte slice.
		expect(body.protocol).toBe('');
		expect(body.cipher).toBe('');
		expect(body.sni).toBe('');
	});

	it('blanks all components when header coerces to a comma-joined array', async () => {
		// Multi-value header arrays stringify as 'a,b,c'; split(':') yields
		// one component containing commas, which fails the regex. None of
		// the array members should be reflected.
		const res = await invoke({
			'cloudfront-viewer-tls': ['TLSv1.3', 'TLS_AES_256_GCM_SHA384', 'sni'] as unknown as string,
		});
		expect(res.statusCode).toBe(200);
		const body = bodyOf(res);
		expect(body.protocol).toBe('');
		expect(body.cipher).toBe('');
		expect(body.sni).toBe('');
	});

	it('treats a two-component header as missing sni', async () => {
		const res = await invoke({ 'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384' });
		expect(res.statusCode).toBe(200);
		const body = bodyOf(res);
		expect(body.protocol).toBe('TLSv1.3');
		expect(body.cipher).toBe('TLS_AES_256_GCM_SHA384');
		expect(body.sni).toBe('');
	});

	it('ignores extra colon-delimited segments past the third', async () => {
		const res = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com:extra:more',
		});
		expect(res.statusCode).toBe(200);
		const body = bodyOf(res);
		expect(body.protocol).toBe('TLSv1.3');
		expect(body.cipher).toBe('TLS_AES_256_GCM_SHA384');
		expect(body.sni).toBe('millsymills.com');
	});

	it('rejects components longer than 128 chars', async () => {
		const c = 'a'.repeat(129);
		const res = await invoke({
			'cloudfront-viewer-tls': `proto:${c}:sni`,
		});
		const body = bodyOf(res);
		expect(body.cipher).toBe('');
	});

	it('only reflects allow-listed Origin in CORS', async () => {
		const allow = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com',
			origin: 'https://millsymills.com',
		});
		expect(allow.headers['access-control-allow-origin']).toBe('https://millsymills.com');
		expect(allow.headers['vary']).toBe('origin');

		const deny = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com',
			origin: 'https://attacker.example',
		});
		expect(deny.headers).not.toHaveProperty('access-control-allow-origin');
	});

	it('accepts uppercase Origin header for CORS reflection', async () => {
		const res = await invoke({
			'cloudfront-viewer-tls': 'TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com',
			Origin: 'https://millsymills.com',
		});
		expect(res.headers['access-control-allow-origin']).toBe('https://millsymills.com');
		expect(res.headers['vary']).toBe('origin');
	});
});
