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
		// 300 'A's would pass the regex (length cap is 128 per component),
		// but the raw header was sliced to 256 before split, so cipher/sni
		// disappear past the truncation point.
		expect((body.protocol as string).length).toBeLessThanOrEqual(256);
		expect(body.cipher).toBe('');
		expect(body.sni).toBe('');
	});

	it('rejects components longer than 128 chars', async () => {
		const c = 'a'.repeat(129);
		const res = await invoke({
			'cloudfront-viewer-tls': `proto:${c}:sni`,
		});
		const body = bodyOf(res);
		expect(body.cipher).toBe('');
	});

	it('coerces non-string header values', async () => {
		// Some Lambda runtimes can deliver multi-value headers as arrays.
		// String coercion produces "a,b" — the regex blanks it out
		// per-component, no crash.
		const res = await invoke({
			'cloudfront-viewer-tls': ['TLSv1.3', 'TLS_AES_256_GCM_SHA384', 'sni'] as unknown as string,
		});
		expect(res.statusCode).toBe(200);
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
});
