// Tests for the WebAuthn demo Lambda handler (issue #446).
//
// Stdlib `node:test` only -- no jest/vitest dep. Run from the repo root:
//
//   node --test infra/lambdas/webauthn_demo/tests/
//
// The handler module instantiates a DynamoDB client at import time and
// reads required env vars. The env vars are set before importing; the
// DynamoDB client calls are intercepted with `test.mock` so no AWS
// network calls happen during the run.

import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

process.env.WEBAUTHN_RP_ID = 'example.test';
process.env.WEBAUTHN_EXPECTED_ORIGIN = 'https://example.test';
process.env.WEBAUTHN_TABLE = 'creds-test';
process.env.WEBAUTHN_SESSIONS_TABLE = 'sessions-test';
const TEST_ORIGIN_SECRET = 'test-origin-secret-value';
process.env.ORIGIN_SECRET = TEST_ORIGIN_SECRET;

const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');

// Capture DynamoDB calls keyed by command name. Tests pre-populate `responses`
// to simulate Get hits/misses; everything else returns {}.
const ddbCalls = [];
let ddbResponses = new Map();

DynamoDBDocumentClient.prototype.send = async function send(cmd) {
	const name = cmd?.constructor?.name ?? 'unknown';
	ddbCalls.push({ name, input: cmd?.input });
	const fixture = ddbResponses.get(name);
	if (typeof fixture === 'function') return fixture(cmd);
	return fixture ?? {};
};

// Import the handler AFTER the SDK send override is in place. The handler
// captures a reference to a DynamoDBDocumentClient instance whose
// prototype-chain `send` method now points at the override above.
const { handler, __test } = await import('../index.mjs');

// Silence `console.warn` by default so EMF blobs and regression-rejected
// warnings don't pollute test output. Individual tests that need to
// inspect the warn output (EMF metric test, counter-regression test)
// install their own stub inside the test body, which restores cleanly.
let originalConsoleWarn;
beforeEach(() => {
	ddbCalls.length = 0;
	ddbResponses = new Map();
	originalConsoleWarn = console.warn;
	console.warn = () => {};
});
afterEach(() => {
	console.warn = originalConsoleWarn;
});

function eventOf({ method = 'POST', path = '/', body, isBase64Encoded = false, secret = TEST_ORIGIN_SECRET } = {}) {
	return {
		rawPath: path,
		requestContext: { http: { method, path } },
		headers: secret == null ? {} : { 'x-origin-secret': secret },
		body: typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body),
		isBase64Encoded,
	};
}

function clientDataJSON(origin) {
	const json = JSON.stringify({ type: 'webauthn.create', origin, challenge: 'x' });
	return Buffer.from(json, 'utf8').toString('base64url');
}

test('GET on a POST route returns 405', async () => {
	const res = await handler(eventOf({ method: 'GET', path: '/registration/options' }));
	assert.equal(res.statusCode, 405);
	assert.equal(res.headers.allow, 'POST');
});

test('unknown route returns 404', async () => {
	const res = await handler(eventOf({ path: '/nope', body: {} }));
	assert.equal(res.statusCode, 404);
});

test('POST without the CloudFront origin secret returns 403', async () => {
	const res = await handler(eventOf({ path: '/registration/options', body: {}, secret: null }));
	assert.equal(res.statusCode, 403);
});

test('POST with a wrong origin secret returns 403', async () => {
	const res = await handler(eventOf({ path: '/registration/options', body: {}, secret: 'wrong' }));
	assert.equal(res.statusCode, 403);
});

test('non-POST without the secret returns a uniform 403, not 405', async () => {
	// The secret gate runs before the method check, so a direct caller
	// hitting the raw Function URL with the wrong method but no secret gets
	// 403 — it can't distinguish a method mismatch from a missing secret and
	// so can't learn that POST is the expected method.
	for (const method of ['GET', 'PUT', 'DELETE']) {
		const res = await handler(eventOf({ method, path: '/registration/options', secret: null }));
		assert.equal(res.statusCode, 403);
	}
});

test('CloudFront /api/passkey/* prefix is stripped to the route key', async () => {
	const res = await handler(eventOf({ path: '/api/passkey/registration/options', body: {} }));
	assert.equal(res.statusCode, 200);
	const body = JSON.parse(res.body);
	assert.equal(typeof body.sessionId, 'string');
});

test('normalizePath strips the /api/passkey prefix and trailing slash', () => {
	assert.equal(__test.normalizePath('/api/passkey/registration/options'), '/registration/options');
	assert.equal(__test.normalizePath('/api/passkey/registration/options/'), '/registration/options');
	assert.equal(__test.normalizePath('/api/passkey'), '/');
	assert.equal(__test.normalizePath('/registration/options'), '/registration/options');
	assert.equal(__test.normalizePath('/api/passkeyXYZ'), '/api/passkeyXYZ');
});

test('secretMatches is constant-time-safe and rejects wrong/short input', () => {
	assert.equal(__test.secretMatches(TEST_ORIGIN_SECRET), true);
	assert.equal(__test.secretMatches('wrong'), false);
	assert.equal(__test.secretMatches(''), false);
	assert.equal(__test.secretMatches(undefined), false);
});

test('secretMatches rejects a same-length-but-wrong secret (timingSafeEqual branch)', () => {
	// The length short-circuit can't catch this: same byte length as the real
	// secret, differing only in the final byte. Exercises the timingSafeEqual
	// comparison itself, not the length guard, so a regression that dropped the
	// constant-time compare (e.g. `return true` after the length check) fails here.
	const sameLengthWrong = `${TEST_ORIGIN_SECRET.slice(0, -1)}X`;
	assert.equal(sameLengthWrong.length, TEST_ORIGIN_SECRET.length);
	assert.notEqual(sameLengthWrong, TEST_ORIGIN_SECRET);
	assert.equal(__test.secretMatches(sameLengthWrong), false);
});

test('header() resolves case-insensitively and null-guards missing input', () => {
	// Function URLs lowercase header keys, but a direct invoke/test may not;
	// the lookup must match defensively so a mixed-case secret header still gates.
	assert.equal(__test.header({ 'X-Origin-Secret': 'v' }, 'x-origin-secret'), 'v');
	assert.equal(__test.header({ 'x-origin-secret': 'v' }, 'x-origin-secret'), 'v');
	assert.equal(__test.header({}, 'x-origin-secret'), undefined);
	assert.equal(__test.header(undefined, 'x-origin-secret'), undefined);
});

test('body larger than 4 KB is rejected with 413', async () => {
	const oversize = 'a'.repeat(5000);
	const res = await handler(
		eventOf({ path: '/registration/options', body: `"${oversize}"` }),
	);
	assert.equal(res.statusCode, 413);
});

test('body larger than 4 KB emits an EMF metric line for CloudWatch', async () => {
	const original = console.warn;
	const lines = [];
	console.warn = (msg) => lines.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
	try {
		const oversize = 'a'.repeat(5000);
		const res = await handler(
			eventOf({ path: '/registration/options', body: `"${oversize}"` }),
		);
		assert.equal(res.statusCode, 413);
	} finally {
		console.warn = original;
	}
	const emf = lines
		.map((line) => {
			try { return JSON.parse(line); } catch { return null; }
		})
		.find((parsed) => parsed && parsed._aws);
	assert.ok(emf, 'expected an EMF JSON line on the 413 path');
	assert.equal(emf._aws.CloudWatchMetrics[0].Namespace, 'MillsymillsCom/WebauthnDemo');
	assert.deepEqual(emf._aws.CloudWatchMetrics[0].Dimensions, [[]]);
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Name, 'BodyTooLarge');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Count');
	assert.equal(emf.BodyTooLarge, 1);
});

test('413 path swallows emf emit failure (does not change status)', async () => {
	const originalWarn = console.warn;
	const originalError = console.error;
	const errors = [];
	console.warn = () => {
		throw new Error('intentional emf failure');
	};
	console.error = (msg, ctx) => errors.push([msg, ctx]);
	try {
		const oversize = 'a'.repeat(5000);
		const res = await handler(
			eventOf({ path: '/registration/options', body: `"${oversize}"` }),
		);
		assert.equal(res.statusCode, 413);
	} finally {
		console.warn = originalWarn;
		console.error = originalError;
	}
	const emfFail = errors.find(([m]) => /emf emit failed/.test(String(m)));
	assert.ok(emfFail, 'expected emf-failure to be logged via console.error');
});

test('non-JSON body is rejected with 400', async () => {
	const res = await handler(eventOf({ path: '/registration/options', body: 'not-json' }));
	assert.equal(res.statusCode, 400);
});

test('JSON array body is rejected with 400 (objects only)', async () => {
	const res = await handler(eventOf({ path: '/registration/options', body: '[]' }));
	assert.equal(res.statusCode, 400);
});

test('/registration/options returns sessionId + userHandle + options', async () => {
	const res = await handler(eventOf({ path: '/registration/options', body: {} }));
	assert.equal(res.statusCode, 200);
	const body = JSON.parse(res.body);
	assert.equal(typeof body.sessionId, 'string');
	assert.equal(typeof body.userHandle, 'string');
	assert.equal(typeof body.options.challenge, 'string');
	assert.equal(body.options.rp.id, 'example.test');
	const putCalls = ddbCalls.filter((c) => c.name === 'PutCommand');
	assert.equal(putCalls.length, 1);
	assert.equal(putCalls[0].input.TableName, 'sessions-test');
	assert.equal(putCalls[0].input.Item.type, 'registration');
});

test('/authentication/options returns sessionId + options', async () => {
	const res = await handler(eventOf({ path: '/authentication/options', body: {} }));
	assert.equal(res.statusCode, 200);
	const body = JSON.parse(res.body);
	assert.equal(typeof body.sessionId, 'string');
	assert.equal(typeof body.options.challenge, 'string');
	const putCalls = ddbCalls.filter((c) => c.name === 'PutCommand');
	assert.equal(putCalls.length, 1);
	assert.equal(putCalls[0].input.Item.type, 'authentication');
});

test('/registration/verify with unknown session returns 400 and emits SessionMiss EMF', async () => {
	ddbResponses.set('GetCommand', { Item: undefined });
	const original = console.warn;
	const lines = [];
	console.warn = (msg) => lines.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
	let res;
	try {
		res = await handler(
			eventOf({
				path: '/registration/verify',
				body: {
					sessionId: 'bogus',
					response: { response: { clientDataJSON: clientDataJSON('https://example.test') } },
				},
			}),
		);
	} finally {
		console.warn = original;
	}
	assert.equal(res.statusCode, 400);
	assert.match(res.body, /unknown or expired session/);
	const emf = lines
		.map((line) => {
			try { return JSON.parse(line); } catch { return null; }
		})
		.find((parsed) => parsed && parsed._aws && parsed.SessionMiss === 1);
	assert.ok(emf, 'expected a SessionMiss EMF JSON line on the session-miss path');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Name, 'SessionMiss');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Count');
});

test('/registration/verify with origin mismatch returns 400 before crypto', async () => {
	// Session exists -- the origin check runs FIRST and rejects before any
	// SimpleWebAuthn call happens, even though the session is valid.
	ddbResponses.set('GetCommand', {
		Item: {
			sessionId: 's1',
			type: 'registration',
			challenge: 'challenge-bytes',
			userHandle: 'uh',
			expiresAt: Math.floor(Date.now() / 1000) + 60,
		},
	});
	const res = await handler(
		eventOf({
			path: '/registration/verify',
			body: {
				sessionId: 's1',
				response: { response: { clientDataJSON: clientDataJSON('https://evil.test') } },
			},
		}),
	);
	assert.equal(res.statusCode, 400);
	assert.match(res.body, /origin mismatch/);
});

test('/authentication/verify with origin mismatch returns 400 before crypto', async () => {
	ddbResponses.set('GetCommand', {
		Item: {
			sessionId: 's1',
			type: 'authentication',
			challenge: 'c',
			userHandle: 'uh',
			expiresAt: Math.floor(Date.now() / 1000) + 60,
		},
	});
	const res = await handler(
		eventOf({
			path: '/authentication/verify',
			body: {
				sessionId: 's1',
				response: { id: 'cred1', response: { clientDataJSON: clientDataJSON('https://evil.test') } },
			},
		}),
	);
	assert.equal(res.statusCode, 400);
	assert.match(res.body, /origin mismatch/);
});

test('/authentication/verify with unknown credential returns 404', async () => {
	let getCount = 0;
	ddbResponses.set('GetCommand', () => {
		getCount += 1;
		if (getCount === 1) {
			// session lookup
			return {
				Item: {
					sessionId: 's1',
					type: 'authentication',
					challenge: 'c',
					userHandle: 'uh',
					expiresAt: Math.floor(Date.now() / 1000) + 60,
				},
			};
		}
		// credential lookup
		return { Item: undefined };
	});
	const res = await handler(
		eventOf({
			path: '/authentication/verify',
			body: {
				sessionId: 's1',
				response: {
					id: 'never-registered',
					response: { clientDataJSON: clientDataJSON('https://example.test') },
				},
			},
		}),
	);
	assert.equal(res.statusCode, 404);
	assert.match(res.body, /unknown credential/);
});

test('trailing slash on a route still resolves', async () => {
	const res = await handler(eventOf({ path: '/registration/options/', body: {} }));
	assert.equal(res.statusCode, 200);
});

test('originMatches accepts only the configured expected origin', () => {
	const good = {
		response: { clientDataJSON: clientDataJSON('https://example.test') },
	};
	const bad = {
		response: { clientDataJSON: clientDataJSON('https://attacker.test') },
	};
	assert.equal(__test.originMatches(good), true);
	assert.equal(__test.originMatches(bad), false);
	assert.equal(__test.originMatches({}), false);
	assert.equal(__test.originMatches({ response: { clientDataJSON: 'not-base64-json' } }), false);
});

test('parseBody handles base64-encoded body', () => {
	const decoded = __test.parseBody({
		isBase64Encoded: true,
		body: Buffer.from('{"a":1}', 'utf8').toString('base64'),
	});
	assert.deepEqual(decoded, { a: 1 });
});

test('parseBody returns {} for empty body', () => {
	assert.deepEqual(__test.parseBody({}), {});
	assert.deepEqual(__test.parseBody({ body: '' }), {});
});

test('updateCredentialCounter issues a conditional UpdateCommand', async () => {
	const result = await __test.updateCredentialCounter('cred1', 0, 5);
	assert.deepEqual(result, { ok: true });
	const updates = ddbCalls.filter((c) => c.name === 'UpdateCommand');
	assert.equal(updates.length, 1);
	const input = updates[0].input;
	assert.equal(input.TableName, 'creds-test');
	assert.deepEqual(input.Key, { credentialId: 'cred1' });
	assert.equal(input.UpdateExpression, 'SET #counter = :new');
	assert.match(input.ConditionExpression, /#counter < :new/);
	assert.equal(input.ExpressionAttributeValues[':new'], 5);
});

test('updateCredentialCounter skips DDB write for always-zero authenticators (U2F)', async () => {
	const result = await __test.updateCredentialCounter('cred-u2f', 0, 0);
	assert.deepEqual(result, { ok: true });
	const updates = ddbCalls.filter((c) => c.name === 'UpdateCommand');
	assert.equal(updates.length, 0);
});

test('updateCredentialCounter does NOT skip a regression-to-zero (stored counter > 0)', async () => {
	// A credential that registered with a positive counter and now presents 0
	// must fall through to the conditional update so the regression is caught,
	// not silently accepted by the U2F always-zero short-circuit.
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('counter not strictly greater');
		err.name = 'ConditionalCheckFailedException';
		err.Item = { credentialId: 'cred1', counter: 9 };
		throw err;
	});
	const originalError = console.error;
	console.error = () => {};
	let result;
	try {
		result = await __test.updateCredentialCounter('cred1', 9, 0);
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(result, { ok: false, reason: 'counter-regression' });
	const updates = ddbCalls.filter((c) => c.name === 'UpdateCommand');
	assert.equal(updates.length, 1, 'regression-to-zero must still issue the update');
});

test('updateCredentialCounter passes ReturnValuesOnConditionCheckFailure=ALL_OLD', async () => {
	await __test.updateCredentialCounter('cred1', 0, 5);
	const updates = ddbCalls.filter((c) => c.name === 'UpdateCommand');
	assert.equal(updates[0].input.ReturnValuesOnConditionCheckFailure, 'ALL_OLD');
});

test('updateCredentialCounter genuine regression: console.error + CounterRegression EMF', async () => {
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('counter not strictly greater');
		err.name = 'ConditionalCheckFailedException';
		err.Item = { credentialId: 'cred1', counter: 7 };
		throw err;
	});
	const originalWarn = console.warn;
	const originalError = console.error;
	const warnings = [];
	const errors = [];
	console.warn = (...args) => warnings.push(args);
	console.error = (...args) => errors.push(args);
	let result;
	try {
		result = await __test.updateCredentialCounter('cred1', 7, 3);
	} finally {
		console.warn = originalWarn;
		console.error = originalError;
	}
	assert.deepEqual(result, { ok: false, reason: 'counter-regression' });
	const regressionError = errors.find(([msg]) => /counter regression detected/.test(String(msg)));
	assert.ok(regressionError, 'expected console.error for genuine regression');
	const ctx = regressionError[1];
	assert.equal(ctx.newCounter, 3);
	assert.equal(ctx.storedCounter, 7);
	assert.equal(ctx.credentialIdHash, __test.credentialDiscriminator('cred1'));
	const emf = warnings
		.map((args) => {
			try { return JSON.parse(String(args[0])); } catch { return null; }
		})
		.find((parsed) => parsed && parsed._aws && parsed.CounterRegression === 1);
	assert.ok(emf, 'expected CounterRegression EMF JSON line');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Name, 'CounterRegression');
});

test('updateCredentialCounter TTL race: warn only, no CounterRegression EMF', async () => {
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('row gone');
		err.name = 'ConditionalCheckFailedException';
		// No err.Item -- attribute_exists(credentialId) was the clause that failed.
		throw err;
	});
	const originalWarn = console.warn;
	const originalError = console.error;
	const warnings = [];
	const errors = [];
	console.warn = (...args) => warnings.push(args);
	console.error = (...args) => errors.push(args);
	let result;
	try {
		result = await __test.updateCredentialCounter('cred1', 5, 3);
	} finally {
		console.warn = originalWarn;
		console.error = originalError;
	}
	assert.deepEqual(result, { ok: true }, 'TTL race is benign -- assertion may proceed');
	const vanished = warnings.find(([msg]) => /credential vanished mid-update/.test(String(msg)));
	assert.ok(vanished, 'expected warn on TTL-race branch');
	const ctx = vanished[1];
	assert.equal(ctx.newCounter, 3);
	assert.equal(ctx.credentialIdHash, __test.credentialDiscriminator('cred1'));
	assert.equal(errors.length, 0, 'TTL race must not console.error');
	const emf = warnings
		.map((args) => {
			try { return JSON.parse(String(args[0])); } catch { return null; }
		})
		.find((parsed) => parsed && parsed._aws && parsed.CounterRegression === 1);
	assert.equal(emf, undefined, 'TTL race must not emit CounterRegression EMF');
});

test('credentialDiscriminator is the first 8 hex chars of SHA-256', () => {
	const hash = __test.credentialDiscriminator('cred1');
	assert.equal(hash.length, 8);
	assert.match(hash, /^[0-9a-f]{8}$/);
	// Same input -> same output (deterministic, non-reversible by design).
	assert.equal(hash, __test.credentialDiscriminator('cred1'));
	assert.notEqual(hash, __test.credentialDiscriminator('cred2'));
});

test('errFields packs message + stack + cause', () => {
	const inner = new Error('boom');
	const outer = new Error('wrapped', { cause: inner });
	const fields = __test.errFields(outer);
	assert.equal(fields.err, 'wrapped');
	assert.equal(typeof fields.stack, 'string');
	assert.equal(fields.cause, inner);
});

test('errFields on undefined returns undefined fields (no crash)', () => {
	assert.deepEqual(__test.errFields(undefined), {
		err: undefined,
		stack: undefined,
		cause: undefined,
	});
});

test('originMatches emits an OriginParseFailure EMF metric on parse failure', () => {
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args);
	// clientDataJSON that base64url-decodes to a recognizable marker, so a leak
	// of decoded viewer content into the metric blob would be detectable.
	const leakMarker = 'LEAKMARKER_zzz_not_json';
	const attackerInput = Buffer.from(leakMarker, 'utf8').toString('base64url');
	try {
		const result = __test.originMatches({
			response: { clientDataJSON: attackerInput },
		});
		assert.equal(result, false);
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	const raw = String(warnings[0][0]);
	const emf = JSON.parse(raw);
	assert.equal(emf.OriginParseFailure, 1);
	assert.equal(emf._aws.CloudWatchMetrics[0].Namespace, 'MillsymillsCom/WebauthnDemo');
	assert.deepEqual(emf._aws.CloudWatchMetrics[0].Dimensions, [[]]);
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Name, 'OriginParseFailure');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Count');
	assert.match(emf.msg, /originMatches parse failed/);
	// No viewer-supplied content: the decoded clientDataJSON prefix that V8's
	// SyntaxError.message would embed must never reach the metric blob.
	assert.equal(emf.err, undefined);
	assert.ok(!raw.includes('LEAKMARKER'), 'decoded viewer input leaked into metric');
});

test('updateCredentialCounter rethrows non-conditional errors', async () => {
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('throttled');
		err.name = 'ProvisionedThroughputExceededException';
		throw err;
	});
	await assert.rejects(
		() => __test.updateCredentialCounter('cred1', 5, 3),
		/throttled/,
	);
});

test('all four routes are registered', () => {
	const routes = [...__test.ROUTES.keys()].sort();
	assert.deepEqual(routes, [
		'/authentication/options',
		'/authentication/verify',
		'/registration/options',
		'/registration/verify',
	]);
});
