// Tests for the csp_report Lambda handler (issue #632).
//
// Stdlib `node:test` only. Run from the repo root:
//
//   node --test infra/csp_report.test.mjs
//
// The handler reads required env vars and constructs an S3 client at import
// time. Env is set before importing; the S3 client's send is overridden so no
// AWS network call happens. @aws-sdk/client-s3 is a root devDependency (the
// Lambda runtime supplies it in production), so the import resolves without a
// per-Lambda node_modules.

import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

process.env.REPORT_BUCKET = 'csp-reports-test';
const TEST_ORIGIN_SECRET = 'test-origin-secret-value';
process.env.ORIGIN_SECRET = TEST_ORIGIN_SECRET;

const { S3Client } = await import('@aws-sdk/client-s3');

const s3Calls = [];
S3Client.prototype.send = async function send(cmd) {
	s3Calls.push({ name: cmd?.constructor?.name ?? 'unknown', input: cmd?.input });
	return {};
};

// Import AFTER the SDK send override so the client instance the handler
// constructs at module load resolves `send` to the override above.
const { handler } = await import('./csp_report.mjs');

let originalConsoleWarn;
beforeEach(() => {
	s3Calls.length = 0;
	originalConsoleWarn = console.warn;
	console.warn = () => {};
});
afterEach(() => {
	console.warn = originalConsoleWarn;
});

function eventOf({ method = 'POST', contentType, body, secret = TEST_ORIGIN_SECRET } = {}) {
	const headers = {};
	if (secret != null) headers['x-origin-secret'] = secret;
	if (contentType != null) headers['content-type'] = contentType;
	return {
		requestContext: { http: { method }, requestId: 'test-request-id' },
		headers,
		body: body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body),
		isBase64Encoded: false,
	};
}

test('non-POST without the secret returns a uniform 403, not 405', async () => {
	// The secret gate runs before the method check, so a direct caller hitting
	// the raw Function URL with the wrong method but no secret gets 403 — it
	// can't distinguish a method mismatch from a missing secret and so can't
	// learn that POST is the expected method.
	for (const method of ['GET', 'PUT', 'DELETE', 'HEAD']) {
		const res = await handler(eventOf({ method, secret: null }));
		assert.equal(res.statusCode, 403);
	}
});

test('POST without the origin secret returns 403', async () => {
	const res = await handler(eventOf({ secret: null, contentType: 'application/csp-report' }));
	assert.equal(res.statusCode, 403);
});

test('POST with a wrong origin secret returns 403', async () => {
	const res = await handler(eventOf({ secret: 'wrong', contentType: 'application/csp-report' }));
	assert.equal(res.statusCode, 403);
});

test('GET with a valid secret returns 405 (method check runs after the secret gate)', async () => {
	// Passing the secret gate must still reject a non-POST — the reorder moved
	// the 405 below the 403 gate, it did not remove it.
	const res = await handler(eventOf({ method: 'GET' }));
	assert.equal(res.statusCode, 405);
	assert.equal(res.headers.allow, 'POST');
});

test('a valid legacy report POST is accepted (204) and written to S3', async () => {
	const res = await handler(
		eventOf({
			contentType: 'application/csp-report',
			body: { 'csp-report': { 'document-uri': 'https://example.test/', 'violated-directive': 'script-src' } },
		}),
	);
	assert.equal(res.statusCode, 204);
	const put = s3Calls.find((c) => c.name === 'PutObjectCommand');
	assert.ok(put, 'expected a PutObjectCommand on the accepted-report path');
	assert.equal(put.input.Bucket, 'csp-reports-test');
	assert.match(put.input.Key, /^reports\/\d{4}\/\d{2}\/\d{2}\//);
});

test('an unsupported content type with a valid secret returns 415 (not S3-written)', async () => {
	const res = await handler(eventOf({ contentType: 'text/plain', body: 'x' }));
	assert.equal(res.statusCode, 415);
	assert.equal(s3Calls.length, 0);
});
