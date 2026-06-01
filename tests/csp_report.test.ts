import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `infra/csp_report.mjs` requires REPORT_BUCKET at import time and
// constructs an S3Client. Set the env var and mock the SDK before the
// module loads -- both happen via `vi.hoisted` which runs before any
// import.
vi.hoisted(() => {
	process.env.REPORT_BUCKET = 'test-bucket';
});

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => {
	class S3Client {
		send(cmd: unknown): Promise<unknown> {
			return sendMock(cmd);
		}
	}
	class PutObjectCommand {
		input: Record<string, unknown>;
		constructor(args: Record<string, unknown>) {
			this.input = args;
		}
	}
	return { S3Client, PutObjectCommand };
});

import { handler } from '../infra/csp_report.mjs';

type LambdaResponse = {
	statusCode: number;
	headers?: Record<string, string>;
	body: string;
};

type LambdaEvent = {
	body?: string;
	isBase64Encoded?: boolean;
	headers?: Record<string, string>;
	requestContext?: {
		requestId?: string;
		http?: { method?: string };
	};
};

function invoke(event: LambdaEvent): Promise<LambdaResponse> {
	return handler(event) as Promise<LambdaResponse>;
}

function postReport(overrides: Partial<LambdaEvent> = {}): LambdaEvent {
	return {
		body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src' } }),
		isBase64Encoded: false,
		headers: { 'content-type': 'application/csp-report' },
		requestContext: { requestId: 'req-1', http: { method: 'POST' } },
		...overrides,
	};
}

beforeEach(() => {
	sendMock.mockReset();
	sendMock.mockResolvedValue({});
});

describe('csp_report handler — method gate', () => {
	it('rejects GET with 405 and Allow: POST', async () => {
		const res = await invoke({
			headers: { 'content-type': 'application/csp-report' },
			requestContext: { http: { method: 'GET' } },
		});
		expect(res.statusCode).toBe(405);
		expect(res.headers?.allow).toBe('POST');
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('rejects PUT/PATCH/DELETE with 405', async () => {
		for (const method of ['PUT', 'PATCH', 'DELETE']) {
			const res = await invoke({
				headers: { 'content-type': 'application/csp-report' },
				requestContext: { http: { method } },
			});
			expect(res.statusCode).toBe(405);
		}
	});

	it('treats missing method as non-POST and rejects', async () => {
		const res = await invoke({});
		expect(res.statusCode).toBe(405);
	});
});

describe('csp_report handler — content-type allow-list', () => {
	it('accepts application/csp-report', async () => {
		const res = await invoke(postReport());
		expect(res.statusCode).toBe(204);
	});

	it('accepts application/reports+json with array body', async () => {
		const res = await invoke(
			postReport({
				body: JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'script-src' } }]),
				headers: { 'content-type': 'application/reports+json' },
			}),
		);
		expect(res.statusCode).toBe(204);
	});

	it('accepts application/json (older Firefox)', async () => {
		const res = await invoke(
			postReport({
				headers: { 'content-type': 'application/json' },
			}),
		);
		expect(res.statusCode).toBe(204);
	});

	it('rejects text/plain with 415', async () => {
		const res = await invoke(postReport({ headers: { 'content-type': 'text/plain' } }));
		expect(res.statusCode).toBe(415);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('strips parameters from content-type (e.g. ;charset=utf-8)', async () => {
		const res = await invoke(
			postReport({ headers: { 'content-type': 'application/csp-report; charset=utf-8' } }),
		);
		expect(res.statusCode).toBe(204);
	});

	it('matches content-type case-insensitively (header lookup is lowercased)', async () => {
		const res = await invoke(
			postReport({ headers: { 'Content-Type': 'application/csp-report' } }),
		);
		expect(res.statusCode).toBe(204);
	});
});

describe('csp_report handler — body cap', () => {
	it('accepts a body just under MAX_BODY_BYTES (16384)', async () => {
		const filler = 'x'.repeat(16_000);
		const res = await invoke(
			postReport({
				body: JSON.stringify({ 'csp-report': { blob: filler } }),
			}),
		);
		expect(res.statusCode).toBe(204);
	});

	it('rejects a body over MAX_BODY_BYTES with 413', async () => {
		const filler = 'x'.repeat(20_000);
		const res = await invoke(
			postReport({
				body: JSON.stringify({ 'csp-report': { blob: filler } }),
			}),
		);
		expect(res.statusCode).toBe(413);
		expect(sendMock).not.toHaveBeenCalled();
	});
});

describe('csp_report handler — body parsing', () => {
	it('decodes base64-encoded body when isBase64Encoded is true', async () => {
		const json = JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src' } });
		const b64 = Buffer.from(json, 'utf-8').toString('base64');
		const res = await invoke(
			postReport({
				body: b64,
				isBase64Encoded: true,
			}),
		);
		expect(res.statusCode).toBe(204);
		expect(sendMock).toHaveBeenCalledOnce();
	});

	it('returns 400 on JSON parse error', async () => {
		const res = await invoke(postReport({ body: '{not json' }));
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('returns 400 on empty body', async () => {
		const res = await invoke(postReport({ body: '' }));
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('returns 400 on missing body', async () => {
		const res = await invoke(postReport({ body: undefined }));
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});
});

describe('csp_report handler — schema validation', () => {
	it('rejects application/csp-report without csp-report key', async () => {
		const res = await invoke(
			postReport({
				body: JSON.stringify({ 'not-csp': {} }),
				headers: { 'content-type': 'application/csp-report' },
			}),
		);
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('rejects application/json without csp-report key', async () => {
		const res = await invoke(
			postReport({
				body: JSON.stringify({ arbitrary: 'payload' }),
				headers: { 'content-type': 'application/json' },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('rejects application/reports+json with non-array body', async () => {
		const res = await invoke(
			postReport({
				body: JSON.stringify({ type: 'csp-violation' }),
				headers: { 'content-type': 'application/reports+json' },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('rejects application/reports+json with non-object array entries', async () => {
		const res = await invoke(
			postReport({
				body: JSON.stringify(['just-a-string']),
				headers: { 'content-type': 'application/reports+json' },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('rejects application/reports+json with an empty array', async () => {
		// `[].every(...)` is `true` -- without an explicit length guard,
		// an empty Reporting API payload would persist a zero-value
		// envelope to S3. Verify the guard exists.
		const res = await invoke(
			postReport({
				body: JSON.stringify([]),
				headers: { 'content-type': 'application/reports+json' },
			}),
		);
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('rejects legacy application/csp-report with an array body', async () => {
		// The legacy `report-uri` format is a single object under the
		// `csp-report` key, not an array. A malformed client posting an
		// array under that content type should 400, not 204.
		const res = await invoke(
			postReport({
				body: JSON.stringify([{ 'csp-report': { 'violated-directive': 'script-src' } }]),
				headers: { 'content-type': 'application/csp-report' },
			}),
		);
		expect(res.statusCode).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});
});

describe('csp_report handler — property tests', () => {
	// Arbitrary JSON values: primitives, arrays, and plain objects nested
	// up to a small depth. Excludes the few well-formed shapes the
	// handler accepts (verified via post-condition in the property).
	const arbJson: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
		json: fc.oneof(
			{ depthSize: 'small', withCrossShrink: true },
			fc.constant(null),
			fc.boolean(),
			fc.integer(),
			fc.double({ noNaN: true }),
			fc.string(),
			fc.array(tie('json'), { maxLength: 4 }),
			fc.dictionary(fc.string(), tie('json'), { maxKeys: 4 }),
		),
	})).json;

	function isAcceptedShape(contentType: string, value: unknown): boolean {
		if (contentType === 'application/reports+json') {
			return (
				Array.isArray(value) &&
				value.length > 0 &&
				value.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
			);
		}
		const isPlainObject = (v: unknown): v is Record<string, unknown> =>
			typeof v === 'object' && v !== null && !Array.isArray(v);
		return (
			isPlainObject(value) && isPlainObject((value as Record<string, unknown>)['csp-report'])
		);
	}

	it('rejects arbitrary non-conforming shapes across all accepted content types', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(
					'application/reports+json',
					'application/csp-report',
					'application/json',
				),
				arbJson,
				async (contentType, payload) => {
					// Filter out the (rare) cases where the random shape happens
					// to be valid -- the property is "non-conforming => 400",
					// not "everything => 400".
					fc.pre(!isAcceptedShape(contentType, payload));
					sendMock.mockClear();
					const res = await invoke(
						postReport({
							body: JSON.stringify(payload),
							headers: { 'content-type': contentType },
						}),
					);
					expect(res.statusCode).toBe(400);
					expect(sendMock).not.toHaveBeenCalled();
				},
			),
			{ numRuns: 64 },
		);
	});
});

type PutInput = { Bucket: string; Key: string; Body: string; ContentType: string };

describe('csp_report handler — happy-path persistence', () => {
	function lastPutInput(): PutInput {
		const call = sendMock.mock.calls.at(-1);
		expect(call).toBeDefined();
		const cmd = call?.[0] as { input: PutInput };
		return cmd.input;
	}

	it('writes envelope (receivedAt, reportType, userAgent, viewerCountry, report)', async () => {
		await invoke(
			postReport({
				headers: {
					'content-type': 'application/csp-report',
					'user-agent': 'Mozilla/5.0',
					'cloudfront-viewer-country': 'US',
				},
			}),
		);
		const input = lastPutInput();
		expect(input.Bucket).toBe('test-bucket');
		expect(input.ContentType).toBe('application/json');
		const env = JSON.parse(input.Body) as {
			receivedAt: string;
			reportType: string;
			userAgent: string;
			viewerCountry: string;
			report: unknown;
		};
		expect(env.reportType).toBe('application/csp-report');
		expect(env.userAgent).toBe('Mozilla/5.0');
		expect(env.viewerCountry).toBe('US');
		expect(env.report).toEqual({ 'csp-report': { 'violated-directive': 'script-src' } });
		// receivedAt is ISO-8601 in UTC.
		expect(env.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	it('falls back to null user-agent / viewer-country when absent', async () => {
		await invoke(
			postReport({
				headers: { 'content-type': 'application/csp-report' },
			}),
		);
		const env = JSON.parse(lastPutInput().Body) as {
			userAgent: string | null;
			viewerCountry: string | null;
		};
		expect(env.userAgent).toBeNull();
		expect(env.viewerCountry).toBeNull();
	});

	it('writes object key shape reports/YYYY/MM/DD/HHMMSS-safeId.json', async () => {
		await invoke(
			postReport({
				requestContext: { requestId: 'req-abc-123', http: { method: 'POST' } },
			}),
		);
		const key = lastPutInput().Key;
		expect(key).toMatch(/^reports\/\d{4}\/\d{2}\/\d{2}\/\d{6}-req-abc-123\.json$/);
	});

	it('sanitizes unsafe chars in requestId for the object key', async () => {
		await invoke(
			postReport({
				requestContext: { requestId: 'evil/../../../etc passwd', http: { method: 'POST' } },
			}),
		);
		const key = lastPutInput().Key;
		// `[^a-zA-Z0-9_-]` is replaced with `_`. No path traversal escapes.
		expect(key).toMatch(/^reports\/\d{4}\/\d{2}\/\d{2}\/\d{6}-evil_{10}etc_passwd\.json$/);
		expect(key).not.toContain('..');
		expect(key).not.toContain(' ');
	});

	it('uses uuid fallback when requestId is missing (no ms-collision)', async () => {
		await invoke(postReport({ requestContext: { http: { method: 'POST' } } }));
		await invoke(postReport({ requestContext: { http: { method: 'POST' } } }));
		const keys = sendMock.mock.calls.map((c) => (c[0] as { input: { Key: string } }).input.Key);
		// Two same-millisecond invocations would otherwise collide on the
		// same key; the uuid suffix guarantees distinct object keys.
		expect(keys[0]).not.toBe(keys[1]);
	});

	it('returns 500 when S3 PutObject fails', async () => {
		sendMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'AccessDenied' }));
		const res = await invoke(postReport());
		expect(res.statusCode).toBe(500);
	});
});

describe('csp_report handler — rejection observability', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	function lastWarn(): Record<string, unknown> {
		const call = warnSpy.mock.calls.at(-1);
		expect(call).toBeDefined();
		return JSON.parse(call?.[0] as string) as Record<string, unknown>;
	}

	it('logs reason=unsupported-content-type on 415', async () => {
		const res = await invoke(postReport({ headers: { 'content-type': 'text/plain' } }));
		expect(res.statusCode).toBe(415);
		const log = lastWarn();
		expect(log.msg).toBe('csp-report rejected');
		expect(log.reason).toBe('unsupported-content-type');
		expect(log.contentType).toBe('text/plain');
	});

	it('logs reason=invalid-json on a JSON parse 400', async () => {
		const res = await invoke(postReport({ body: '{not json' }));
		expect(res.statusCode).toBe(400);
		const log = lastWarn();
		expect(log.msg).toBe('csp-report rejected');
		expect(log.reason).toBe('invalid-json');
		expect(log.contentType).toBe('application/csp-report');
	});

	it('logs reason=malformed-report on a schema 400 (format-drift signal)', async () => {
		const res = await invoke(postReport({ body: JSON.stringify({ 'not-csp': {} }) }));
		expect(res.statusCode).toBe(400);
		const log = lastWarn();
		expect(log.msg).toBe('csp-report rejected');
		expect(log.reason).toBe('malformed-report');
	});

	it('never includes the raw request body in a rejection log line', async () => {
		await invoke(
			postReport({
				body: JSON.stringify({ secret: 'sensitive-value' }),
				headers: { 'content-type': 'application/json' },
			}),
		);
		const serialized = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
		expect(serialized).not.toContain('sensitive-value');
	});
});
