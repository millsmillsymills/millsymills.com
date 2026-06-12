// Verify-SUCCESS integration tests for the WebAuthn demo Lambda (issue #680).
//
// The sibling handler.test.mjs covers every verify *failure* branch (unknown
// session, origin mismatch before crypto, unknown credential 404) but never
// drives a verify to `verified: true`, so the success wiring -- registration
// persists the credential, authentication advances the signature counter --
// could regress without a single test going red. Forcing `verified: true`
// requires mocking the `@simplewebauthn/server` crypto boundary, which is an
// ESM module-level mock (`node:test` mock.module, gated behind
// --experimental-test-module-mocks). That is why this lives in its own file:
// node:test runs each test file in a separate process, so the module mock
// here stays isolated from handler.test.mjs, which deliberately exercises the
// real (pre-crypto) reject paths.
//
//   node --test --experimental-test-module-mocks \
//     infra/lambdas/webauthn_demo/tests/

import assert from 'node:assert/strict';
import { test, beforeEach, afterEach, mock } from 'node:test';

process.env.WEBAUTHN_RP_ID = 'example.test';
process.env.WEBAUTHN_EXPECTED_ORIGIN = 'https://example.test';
process.env.WEBAUTHN_TABLE = 'creds-test';
process.env.WEBAUTHN_SESSIONS_TABLE = 'sessions-test';
const TEST_ORIGIN_SECRET = 'test-origin-secret-value';
process.env.ORIGIN_SECRET = TEST_ORIGIN_SECRET;

const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');

const ddbCalls = [];
let ddbResponses = new Map();

DynamoDBDocumentClient.prototype.send = async function send(cmd) {
	const name = cmd?.constructor?.name ?? 'unknown';
	ddbCalls.push({ name, input: cmd?.input });
	const fixture = ddbResponses.get(name);
	if (typeof fixture === 'function') return fixture(cmd);
	return fixture ?? {};
};

// Mutable results the mocked crypto boundary returns -- each test sets the
// one it drives before calling the handler. Mocking the module (not a
// per-test stub) is the only way to force `verified: true` without a real
// attestation/assertion, since index.mjs binds these names at import time.
let registrationVerifyResult;
let authenticationVerifyResult;

// `mock.module`'s option shape changed across Node versions: the single
// `exports` option (and the `DeprecationWarning` for the legacy
// `namedExports`/`defaultExport` keys) landed in Node 25.9.0 (nodejs/node
// #61727). CI pins Node 22, which only understands `namedExports` and silently
// ignores `exports`. Pick the shape the running Node supports so the suite
// stays warning-free on both the pinned CI runtime and newer local toolchains
// (where `namedExports` would otherwise trip the zero-warnings policy).
const webauthnServerMock = {
	generateRegistrationOptions: async () => ({ challenge: 'c' }),
	generateAuthenticationOptions: async () => ({ challenge: 'c' }),
	verifyRegistrationResponse: async () => registrationVerifyResult,
	verifyAuthenticationResponse: async () => authenticationVerifyResult,
};
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const supportsExportsOption = nodeMajor > 25 || (nodeMajor === 25 && nodeMinor >= 9);
mock.module(
	'@simplewebauthn/server',
	supportsExportsOption ? { exports: webauthnServerMock } : { namedExports: webauthnServerMock },
);

const { handler } = await import('../index.mjs');

let originalConsoleWarn;
beforeEach(() => {
	ddbCalls.length = 0;
	ddbResponses = new Map();
	registrationVerifyResult = undefined;
	authenticationVerifyResult = undefined;
	originalConsoleWarn = console.warn;
	console.warn = () => {};
});
afterEach(() => {
	console.warn = originalConsoleWarn;
});

function eventOf({ path, body }) {
	return {
		rawPath: path,
		requestContext: { http: { method: 'POST', path } },
		headers: { 'x-origin-secret': TEST_ORIGIN_SECRET },
		body: JSON.stringify(body),
		isBase64Encoded: false,
	};
}

function clientDataJSON(origin) {
	const json = JSON.stringify({ type: 'webauthn.create', origin, challenge: 'x' });
	return Buffer.from(json, 'utf8').toString('base64url');
}

function registrationSession() {
	return {
		Item: {
			sessionId: 's1',
			type: 'registration',
			challenge: 'challenge-bytes',
			userHandle: 'user-handle-1',
			expiresAt: Math.floor(Date.now() / 1000) + 60,
		},
	};
}

function authenticationSession() {
	return {
		Item: {
			sessionId: 's1',
			type: 'authentication',
			challenge: 'challenge-bytes',
			expiresAt: Math.floor(Date.now() / 1000) + 60,
		},
	};
}

test('registration verify success persists the credential via putCredential', async () => {
	ddbResponses.set('GetCommand', registrationSession());
	registrationVerifyResult = {
		verified: true,
		registrationInfo: {
			credential: {
				id: 'new-credential-id',
				publicKey: new Uint8Array([1, 2, 3, 4]),
				counter: 0,
			},
		},
	};

	const res = await handler(
		eventOf({
			path: '/registration/verify',
			body: {
				sessionId: 's1',
				response: {
					response: {
						clientDataJSON: clientDataJSON('https://example.test'),
						transports: ['internal', 'hybrid'],
					},
				},
			},
		}),
	);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(JSON.parse(res.body), { verified: true, userHandle: 'user-handle-1' });

	const credPut = ddbCalls.find(
		(c) => c.name === 'PutCommand' && c.input.TableName === 'creds-test',
	);
	assert.ok(credPut, 'expected a PutCommand against the credentials table');
	assert.equal(credPut.input.Item.credentialId, 'new-credential-id');
	assert.deepEqual(credPut.input.Item.publicKey, new Uint8Array([1, 2, 3, 4]));
	assert.equal(credPut.input.Item.counter, 0);
	assert.equal(credPut.input.Item.userHandle, 'user-handle-1');
	assert.deepEqual(credPut.input.Item.transports, new Set(['internal', 'hybrid']));
	assert.equal(typeof credPut.input.Item.expiresAt, 'number');
});

test('registration verify success defaults a missing counter to 0', async () => {
	ddbResponses.set('GetCommand', registrationSession());
	registrationVerifyResult = {
		verified: true,
		registrationInfo: {
			credential: {
				id: 'cred-no-counter',
				publicKey: new Uint8Array([9]),
			},
		},
	};

	const res = await handler(
		eventOf({
			path: '/registration/verify',
			body: {
				sessionId: 's1',
				response: { response: { clientDataJSON: clientDataJSON('https://example.test') } },
			},
		}),
	);

	assert.equal(res.statusCode, 200);
	const credPut = ddbCalls.find(
		(c) => c.name === 'PutCommand' && c.input.TableName === 'creds-test',
	);
	assert.equal(credPut.input.Item.counter, 0);
});

test('authentication verify success advances the counter via updateCredentialCounter', async () => {
	let getCount = 0;
	ddbResponses.set('GetCommand', () => {
		getCount += 1;
		if (getCount === 1) return authenticationSession();
		return {
			Item: {
				credentialId: 'cred1',
				publicKey: new Uint8Array([1, 2, 3]),
				counter: 0,
				userHandle: 'user-handle-1',
			},
		};
	});
	authenticationVerifyResult = {
		verified: true,
		authenticationInfo: { newCounter: 5 },
	};

	const res = await handler(
		eventOf({
			path: '/authentication/verify',
			body: {
				sessionId: 's1',
				response: {
					id: 'cred1',
					response: { clientDataJSON: clientDataJSON('https://example.test') },
				},
			},
		}),
	);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(JSON.parse(res.body), { verified: true, userHandle: 'user-handle-1' });

	const update = ddbCalls.find((c) => c.name === 'UpdateCommand');
	assert.ok(update, 'expected an UpdateCommand from updateCredentialCounter');
	assert.equal(update.input.TableName, 'creds-test');
	assert.deepEqual(update.input.Key, { credentialId: 'cred1' });
	assert.equal(update.input.ExpressionAttributeValues[':new'], 5);

	const credPut = ddbCalls.find(
		(c) => c.name === 'PutCommand' && c.input.TableName === 'creds-test',
	);
	assert.equal(credPut, undefined, 'authentication must not write a new credential');
});

test('authentication verify success rejects a regressed counter as a cloned authenticator', async () => {
	let getCount = 0;
	ddbResponses.set('GetCommand', () => {
		getCount += 1;
		if (getCount === 1) return authenticationSession();
		return {
			Item: {
				credentialId: 'cred1',
				publicKey: new Uint8Array([1, 2, 3]),
				counter: 7,
				userHandle: 'user-handle-1',
			},
		};
	});
	ddbResponses.set('UpdateCommand', () => {
		const err = new Error('counter not strictly greater');
		err.name = 'ConditionalCheckFailedException';
		err.Item = { credentialId: 'cred1', counter: 7 };
		throw err;
	});
	authenticationVerifyResult = {
		verified: true,
		authenticationInfo: { newCounter: 3 },
	};

	const originalError = console.error;
	console.error = () => {};
	let res;
	try {
		res = await handler(
			eventOf({
				path: '/authentication/verify',
				body: {
					sessionId: 's1',
					response: {
						id: 'cred1',
						response: { clientDataJSON: clientDataJSON('https://example.test') },
					},
				},
			}),
		);
	} finally {
		console.error = originalError;
	}

	assert.equal(res.statusCode, 401);
	assert.match(res.body, /counter regressed/);
});
