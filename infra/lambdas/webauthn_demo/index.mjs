// Lambda for the WebAuthn / passkey demo backend (issue #140 logic
// slice, #446). Replaces the scaffold stub shipped in PR #444 with the
// real registration + authentication flows backed by
// `@simplewebauthn/server` v13.
//
// Routes (all POST on the Function URL, JSON in / JSON out):
//
//   /registration/options   -> { rpID, ... } registration options +
//                              new synthetic userHandle
//   /registration/verify    -> validates attestation response, persists
//                              the credential
//   /authentication/options -> challenge for an existing userHandle
//   /authentication/verify  -> validates the assertion + bumps counter
//
// Storage shape:
//
//   `webauthn_credentials` (PK credentialId S) -- one row per registered
//   credential. Attrs: publicKey (B), counter (N), userHandle (S),
//   transports (SS), expiresAt (N TTL ~24h from creation). No PII.
//
//   `webauthn_sessions` (PK sessionId S) -- one short-lived (5 min TTL)
//   row per in-flight ceremony. Attrs: challenge (B), userHandle (S),
//   type (S, 'registration'|'authentication'), expiresAt (N).
//
// Security posture:
//
//   * `Origin` of clientDataJSON is bound to `https://${WEBAUTHN_RP_ID}`
//     via `expectedOrigin` -- SimpleWebAuthn rejects any other origin.
//   * RP ID is bound to `WEBAUTHN_RP_ID` -- assertions for other
//     domains are rejected.
//   * Request bodies > 4 KB are rejected before parse.
//   * Error responses never leak stack traces or internal errors. The
//     server-side log carries the full error for triage.
//   * Credential IDs are NOT logged. Only opaque session IDs appear in
//     CloudWatch.

import { randomBytes } from 'node:crypto';

import {
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	DeleteCommand,
	GetCommand,
	PutCommand,
	UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';

const RP_ID = requireEnv('WEBAUTHN_RP_ID');
const EXPECTED_ORIGIN = requireEnv('WEBAUTHN_EXPECTED_ORIGIN');
const CREDENTIALS_TABLE = requireEnv('WEBAUTHN_TABLE');
const SESSIONS_TABLE = requireEnv('WEBAUTHN_SESSIONS_TABLE');

const RP_NAME = 'millsymills passkey demo';
const MAX_BODY_BYTES = 4096;
const SESSION_TTL_SECONDS = 5 * 60;
const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
	marshallOptions: { removeUndefinedValues: true },
});

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} env var is required`);
	return value;
}

function jsonResponse(statusCode, body) {
	return {
		statusCode,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
		},
		body: JSON.stringify(body),
	};
}

function errorResponse(statusCode, reason) {
	return jsonResponse(statusCode, { error: reason });
}

function bytesFromBase64url(b64u) {
	return new Uint8Array(Buffer.from(b64u, 'base64url'));
}

function newSessionId() {
	return randomBytes(16).toString('base64url');
}

function newUserHandle() {
	return randomBytes(16).toString('base64url');
}

function nowEpochSeconds() {
	return Math.floor(Date.now() / 1000);
}

function parseBody(event) {
	const raw = event?.body;
	if (raw == null || raw === '') return {};
	const decoded = event?.isBase64Encoded
		? Buffer.from(String(raw), 'base64').toString('utf8')
		: String(raw);
	if (decoded.length > MAX_BODY_BYTES) {
		// EMF metric for the body-too-large alarm in webauthn_demo.tf.
		// Wrapped so a hypothetical stringify/log failure can't turn the
		// 413 path into an uncaught exception (which the outer handler
		// catch would remap to 400 with the wrong message and lose the
		// metric silently).
		try {
			console.warn(JSON.stringify({
				_aws: {
					Timestamp: Date.now(),
					CloudWatchMetrics: [{
						Namespace: 'MillsymillsCom/WebauthnDemo',
						Dimensions: [[]],
						Metrics: [{ Name: 'BodyTooLarge', Unit: 'Count' }],
					}],
				},
				level: 'warn',
				msg: 'webauthn-demo body too large',
				bytes: decoded.length,
				max: MAX_BODY_BYTES,
				BodyTooLarge: 1,
			}));
		} catch (emfErr) {
			console.error('emf emit failed', { err: emfErr?.message });
		}
		const err = new Error('body too large');
		err.statusCode = 413;
		throw err;
	}
	try {
		const parsed = JSON.parse(decoded);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			const err = new Error('body must be a JSON object');
			err.statusCode = 400;
			throw err;
		}
		return parsed;
	} catch (err) {
		if (err.statusCode) throw err;
		const wrapped = new Error('body is not valid JSON');
		wrapped.statusCode = 400;
		throw wrapped;
	}
}

async function putSession(sessionId, payload) {
	await ddb.send(
		new PutCommand({
			TableName: SESSIONS_TABLE,
			Item: {
				sessionId,
				...payload,
				expiresAt: nowEpochSeconds() + SESSION_TTL_SECONDS,
			},
		}),
	);
}

async function takeSession(sessionId, expectedType) {
	if (!sessionId || typeof sessionId !== 'string') return null;
	const { Item } = await ddb.send(
		new GetCommand({ TableName: SESSIONS_TABLE, Key: { sessionId } }),
	);
	if (!Item) return null;
	// Single-use: delete eagerly so a replayed sessionId can't reuse the
	// challenge even before TTL fires.
	await ddb.send(
		new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { sessionId } }),
	);
	if (Item.type !== expectedType) return null;
	if (typeof Item.expiresAt === 'number' && Item.expiresAt < nowEpochSeconds()) {
		return null;
	}
	return Item;
}

// Demo lookup: we only ever look credentials up by `credentialId`. The
// client echoes its credentialId back on /authentication/verify, and
// /authentication/options returns `allowCredentials = []` (discoverable
// passkey UX). The userHandle is stored alongside the credential for
// completeness but isn't a secondary lookup key for this demo.
async function getCredentialById(credentialId) {
	if (!credentialId || typeof credentialId !== 'string') return null;
	const { Item } = await ddb.send(
		new GetCommand({
			TableName: CREDENTIALS_TABLE,
			Key: { credentialId },
		}),
	);
	return Item ?? null;
}

async function putCredential(record) {
	await ddb.send(
		new PutCommand({
			TableName: CREDENTIALS_TABLE,
			Item: {
				credentialId: record.credentialId,
				publicKey: record.publicKey,
				counter: record.counter,
				userHandle: record.userHandle,
				transports:
					Array.isArray(record.transports) && record.transports.length > 0
						? new Set(record.transports)
						: undefined,
				expiresAt: nowEpochSeconds() + CREDENTIAL_TTL_SECONDS,
			},
		}),
	);
}

// Conditional UpdateItem: two concurrent /authentication/verify
// requests for the same credential could otherwise read counter=N and
// both write N+1, losing the monotonicity that WebAuthn relies on for
// cloned-authenticator detection. The condition is the WebAuthn
// invariant itself -- a regression is either a replay or a clone.
//
// WebAuthn L3 §6.1.1: an authenticator that does not implement
// signature counters MUST report `signCount = 0` on every assertion.
// SimpleWebAuthn already accepted this auth, so persisting 0 is a
// no-op -- and skipping it avoids a guaranteed `0 < 0` condition
// failure on every assertion for U2F-style keys.
async function updateCredentialCounter(credentialId, newCounter) {
	if (!credentialId || typeof credentialId !== 'string') return;
	if (newCounter === 0) return;
	try {
		await ddb.send(
			new UpdateCommand({
				TableName: CREDENTIALS_TABLE,
				Key: { credentialId },
				UpdateExpression: 'SET #counter = :new',
				ConditionExpression:
					'attribute_exists(credentialId) AND #counter < :new',
				ExpressionAttributeNames: { '#counter': 'counter' },
				ExpressionAttributeValues: { ':new': newCounter },
			}),
		);
	} catch (err) {
		if (err?.name === 'ConditionalCheckFailedException') {
			console.warn('webauthn-demo counter regression rejected', { newCounter });
			return;
		}
		throw err;
	}
}

// --------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------

async function registrationOptionsHandler() {
	const userHandle = newUserHandle();
	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: RP_ID,
		userID: bytesFromBase64url(userHandle),
		userName: `demo-${userHandle.slice(0, 8)}`,
		attestationType: 'none',
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'preferred',
		},
		supportedAlgorithmIDs: [-7, -257],
	});

	const sessionId = newSessionId();
	await putSession(sessionId, {
		type: 'registration',
		challenge: options.challenge,
		userHandle,
	});

	return jsonResponse(200, { sessionId, userHandle, options });
}

async function registrationVerifyHandler(body) {
	const { sessionId, response } = body;
	if (!response || typeof response !== 'object') {
		return errorResponse(400, 'missing response');
	}
	const session = await takeSession(sessionId, 'registration');
	if (!session) return errorResponse(400, 'unknown or expired session');

	if (!originMatches(response)) {
		return errorResponse(400, 'origin mismatch');
	}

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: session.challenge,
			expectedOrigin: EXPECTED_ORIGIN,
			expectedRPID: RP_ID,
			requireUserVerification: false,
		});
	} catch (err) {
		console.error('registration verify failed', { sessionId, err: err?.message });
		return errorResponse(400, 'registration verification failed');
	}

	if (!verification.verified || !verification.registrationInfo) {
		return errorResponse(400, 'registration not verified');
	}

	const { credential } = verification.registrationInfo;
	await putCredential({
		credentialId: credential.id,
		publicKey: credential.publicKey,
		counter: credential.counter ?? 0,
		userHandle: session.userHandle,
		transports: response.response?.transports,
	});

	return jsonResponse(200, { verified: true, userHandle: session.userHandle });
}

async function authenticationOptionsHandler(body) {
	const { userHandle } = body;
	const options = await generateAuthenticationOptions({
		rpID: RP_ID,
		userVerification: 'preferred',
		allowCredentials: [],
	});

	const sessionId = newSessionId();
	await putSession(sessionId, {
		type: 'authentication',
		challenge: options.challenge,
		userHandle: typeof userHandle === 'string' ? userHandle : '',
	});

	return jsonResponse(200, { sessionId, options });
}

async function authenticationVerifyHandler(body) {
	const { sessionId, response } = body;
	if (!response || typeof response !== 'object') {
		return errorResponse(400, 'missing response');
	}
	const session = await takeSession(sessionId, 'authentication');
	if (!session) return errorResponse(400, 'unknown or expired session');

	if (!originMatches(response)) {
		return errorResponse(400, 'origin mismatch');
	}

	if (typeof response.id !== 'string' || response.id.length === 0) {
		return errorResponse(400, 'missing credential id');
	}
	const credential = await getCredentialById(response.id);
	if (!credential) return errorResponse(404, 'unknown credential');

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: session.challenge,
			expectedOrigin: EXPECTED_ORIGIN,
			expectedRPID: RP_ID,
			requireUserVerification: false,
			credential: {
				id: credential.credentialId,
				publicKey: toUint8Array(credential.publicKey),
				counter: Number(credential.counter ?? 0),
				transports: credential.transports
					? Array.from(credential.transports)
					: undefined,
			},
		});
	} catch (err) {
		console.error('authentication verify failed', { sessionId, err: err?.message });
		return errorResponse(400, 'authentication verification failed');
	}

	if (!verification.verified) return errorResponse(400, 'authentication not verified');

	await updateCredentialCounter(
		credential.credentialId,
		verification.authenticationInfo.newCounter,
	);

	return jsonResponse(200, {
		verified: true,
		userHandle: credential.userHandle,
	});
}

function toUint8Array(value) {
	if (value instanceof Uint8Array) return value;
	if (Buffer.isBuffer(value)) return new Uint8Array(value);
	if (value && typeof value === 'object' && typeof value.length === 'number') {
		return new Uint8Array(value);
	}
	throw new Error('public key is not bytes');
}

// SimpleWebAuthn cross-checks origin internally via `expectedOrigin`, but
// we additionally pre-check the clientDataJSON origin and fail closed
// with a stable error code. Keeps the rejection path observable to tests
// and to the client.
function originMatches(response) {
	try {
		const clientDataJSON = response?.response?.clientDataJSON;
		if (typeof clientDataJSON !== 'string') return false;
		const decoded = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
		const parsed = JSON.parse(decoded);
		return parsed?.origin === EXPECTED_ORIGIN;
	} catch {
		return false;
	}
}

const ROUTES = new Map([
	['/registration/options', registrationOptionsHandler],
	['/registration/verify', registrationVerifyHandler],
	['/authentication/options', authenticationOptionsHandler],
	['/authentication/verify', authenticationVerifyHandler],
]);

export const handler = async (event) => {
	const method = event?.requestContext?.http?.method ?? 'GET';
	const rawPath = event?.rawPath ?? event?.requestContext?.http?.path ?? '/';
	const path = normalizePath(rawPath);

	if (method !== 'POST') {
		return { statusCode: 405, headers: { allow: 'POST' }, body: '' };
	}

	const route = ROUTES.get(path);
	if (!route) return errorResponse(404, 'not found');

	let body;
	try {
		body = parseBody(event);
	} catch (err) {
		return errorResponse(err.statusCode ?? 400, err.message || 'bad request');
	}

	try {
		return await route(body);
	} catch (err) {
		console.error('handler error', { path, err: err?.message });
		return errorResponse(500, 'internal error');
	}
};

function normalizePath(p) {
	if (typeof p !== 'string') return '/';
	// Strip trailing slashes (except for the root).
	const trimmed = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
	return trimmed;
}

// Exposed for unit tests. Not part of the Lambda contract.
export const __test = {
	originMatches,
	parseBody,
	normalizePath,
	ROUTES,
	updateCredentialCounter,
};
