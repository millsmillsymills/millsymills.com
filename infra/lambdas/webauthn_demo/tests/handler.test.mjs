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
import { test, beforeEach } from 'node:test';

process.env.WEBAUTHN_RP_ID = 'example.test';
process.env.WEBAUTHN_EXPECTED_ORIGIN = 'https://example.test';
process.env.WEBAUTHN_TABLE = 'creds-test';
process.env.WEBAUTHN_SESSIONS_TABLE = 'sessions-test';

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

beforeEach(() => {
	ddbCalls.length = 0;
	ddbResponses = new Map();
});

function eventOf({ method = 'POST', path = '/', body, isBase64Encoded = false } = {}) {
	return {
		rawPath: path,
		requestContext: { http: { method, path } },
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
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Name, 'BodyTooLarge');
	assert.equal(emf._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Count');
	assert.equal(emf.BodyTooLarge, 1);
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

test('/registration/verify with unknown session returns 400', async () => {
	ddbResponses.set('GetCommand', { Item: undefined });
	const res = await handler(
		eventOf({
			path: '/registration/verify',
			body: {
				sessionId: 'bogus',
				response: { response: { clientDataJSON: clientDataJSON('https://example.test') } },
			},
		}),
	);
	assert.equal(res.statusCode, 400);
	assert.match(res.body, /unknown or expired session/);
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
	await __test.updateCredentialCounter('cred1', 5);
	const updates = ddbCalls.filter((c) => c.name === 'UpdateCommand');
	assert.equal(updates.length, 1);
	const input = updates[0].input;
	assert.equal(input.TableName, 'creds-test');
	assert.deepEqual(input.Key, { credentialId: 'cred1' });
	assert.equal(input.UpdateExpression, 'SET #counter = :new');
	assert.match(input.ConditionExpression, /#counter < :new/);
	assert.equal(input.ExpressionAttributeValues[':new'], 5);
});

test('updateCredentialCounter swallows ConditionalCheckFailedException (counter regression)', async () => {
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('counter not strictly greater');
		err.name = 'ConditionalCheckFailedException';
		throw err;
	});
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args);
	try {
		await __test.updateCredentialCounter('cred1', 3);
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	assert.match(String(warnings[0][0]), /counter regression/);
});

test('updateCredentialCounter rethrows non-conditional errors', async () => {
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('throttled');
		err.name = 'ProvisionedThroughputExceededException';
		throw err;
	});
	await assert.rejects(
		() => __test.updateCredentialCounter('cred1', 3),
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
