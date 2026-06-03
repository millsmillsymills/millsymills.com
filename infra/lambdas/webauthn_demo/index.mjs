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

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
const ORIGIN_SECRET_BYTES = Buffer.from(requireEnv('ORIGIN_SECRET'), 'utf-8');

// CloudFront forwards browser requests under /api/passkey/*; the Function
// URL receives that full path. Strip the prefix so the route table keys
// (/registration/options, …) match whether the request arrives via
// CloudFront (prefixed) or a direct test/rehearsal call (unprefixed).
// MUST stay in sync with the CloudFront cache behavior's path_pattern in
// infra/cloudfront.tf ("/api/passkey/*") — if one moves, the other must
// too or every CloudFront-forwarded request silently 404s.
const ROUTE_PREFIX = '/api/passkey';

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

// Non-reversible discriminator for logs: the file header bans logging
// the raw credentialId, but operators still need *some* per-credential
// key to correlate alarms in Logs Insights. The first 8 hex chars of
// SHA-256 give 32 bits of collision space -- plenty to tell apart
// "one user's hardware key is misbehaving" from "fleet-wide bug".
function credentialDiscriminator(credentialId) {
	return createHash('sha256').update(credentialId).digest('hex').slice(0, 8);
}

// Structured error fields for `console.error` calls. The outer log
// destination (CloudWatch) is JSON-aware, so emitting these as fields
// (not interpolated strings) keeps Logs Insights queries on
// `err.stack` / `err.cause` working.
function errFields(err) {
	return {
		err: err?.message,
		stack: err?.stack,
		cause: err?.cause,
	};
}

// Case-insensitive header lookup. Lambda Function URLs lowercase header
// keys, but a direct test/invoke may not, so match defensively.
function header(headers, name) {
	if (!headers) return undefined;
	const lower = name.toLowerCase();
	for (const k of Object.keys(headers)) {
		if (k.toLowerCase() === lower) return headers[k];
	}
	return undefined;
}

// Constant-time comparison of the CloudFront-injected origin secret. The
// length check short-circuits before timingSafeEqual (which throws on
// length mismatch); the byte compare is timing-safe so a direct caller of
// the public Function URL can't recover the secret one character at a time.
function secretMatches(candidate) {
	if (typeof candidate !== 'string') return false;
	const candidateBytes = Buffer.from(candidate, 'utf-8');
	if (candidateBytes.length !== ORIGIN_SECRET_BYTES.length) return false;
	return timingSafeEqual(candidateBytes, ORIGIN_SECRET_BYTES);
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

// EMF metric for the origin-secret-mismatch alarm in webauthn_demo.tf.
// Fired on the 403 gate when a request reaches the raw Function URL
// without CloudFront's injected x-origin-secret. Sustained volume is the
// direct-call brute-force signal; like SessionMiss, Lambda's built-in
// Errors metric can't see a handler-returned 403. Wrapped so a
// stringify/log failure can't turn the gate into an uncaught exception.
function emitOriginSecretMismatchMetric() {
	try {
		console.warn(JSON.stringify({
			_aws: {
				Timestamp: Date.now(),
				CloudWatchMetrics: [{
					Namespace: 'MillsymillsCom/WebauthnDemo',
					Dimensions: [[]],
					Metrics: [{ Name: 'OriginSecretMismatch', Unit: 'Count' }],
				}],
			},
			level: 'warn',
			msg: 'webauthn-demo origin-secret mismatch',
			OriginSecretMismatch: 1,
		}));
	} catch (emfErr) {
		console.error('emf emit failed', { err: emfErr?.message });
	}
}

// EMF metric for the session-miss alarm in webauthn_demo.tf. Fired
// every time a verify handler gets a sessionId that has no entry in
// the sessions table (unknown OR expired OR replayed-after-eager-delete).
// Sustained volume on a public no-auth endpoint is the brute-force /
// session-guessing signal — the handler returns 400 either way but
// AWS/Lambda's Errors metric only counts uncaught exceptions, not
// handler-returned 4xx. Wrapped so a stringify/log failure can't turn
// the 400 path into an uncaught exception.
function emitSessionMissMetric() {
	try {
		console.warn(JSON.stringify({
			_aws: {
				Timestamp: Date.now(),
				CloudWatchMetrics: [{
					Namespace: 'MillsymillsCom/WebauthnDemo',
					Dimensions: [[]],
					Metrics: [{ Name: 'SessionMiss', Unit: 'Count' }],
				}],
			},
			level: 'warn',
			msg: 'webauthn-demo session miss',
			SessionMiss: 1,
		}));
	} catch (emfErr) {
		console.error('emf emit failed', { err: emfErr?.message });
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
				// Distinguish ConditionalCheckFailedException sources by
				// inspecting the row state at the time of failure: absent
				// row = TTL race, stored counter >= new = genuine regression
				// (clone / replay). Without ALL_OLD the catch block can't
				// tell them apart and a clone signal drowns in TTL noise.
				ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
			}),
		);
	} catch (err) {
		if (err?.name === 'ConditionalCheckFailedException') {
			const credentialIdHash = credentialDiscriminator(credentialId);
			const old = err.Item;
			if (!old) {
				// `attribute_exists(credentialId)` failed -- the row is
				// gone. Most likely DynamoDB TTL evicted it between the
				// `getCredentialById` lookup in the verify handler and
				// this update. Benign; the assertion already succeeded
				// crypto-wise.
				console.warn('webauthn-demo credential vanished mid-update', {
					newCounter,
					credentialIdHash,
				});
				return;
			}
			// Row exists and the counter did NOT advance -- the
			// `#counter < :new` clause failed. This is the WebAuthn
			// clone-detection signal: a second authenticator copy with
			// the same private key replayed an older signCount, or a
			// genuine attacker is replaying captured assertions. Log
			// + emit CounterRegression EMF so the alarm pages.
			console.error('webauthn-demo counter regression detected', {
				newCounter,
				storedCounter: old.counter,
				credentialIdHash,
			});
			emitCounterRegressionMetric();
			return;
		}
		throw err;
	}
}

// EMF metric for the counter-regression alarm in webauthn_demo.tf.
// Emitted only on the genuine-regression branch of
// updateCredentialCounter's catch -- TTL races and counter=0
// authenticators (the other two ConditionalCheckFailedException
// sources) deliberately don't emit so the alarm reflects real clone /
// replay signal. Wrapped per the same defense as BodyTooLarge /
// SessionMiss: a stringify/log failure can't escape and turn an
// already-handled regression into an uncaught exception.
function emitCounterRegressionMetric() {
	try {
		console.warn(JSON.stringify({
			_aws: {
				Timestamp: Date.now(),
				CloudWatchMetrics: [{
					Namespace: 'MillsymillsCom/WebauthnDemo',
					Dimensions: [[]],
					Metrics: [{ Name: 'CounterRegression', Unit: 'Count' }],
				}],
			},
			level: 'warn',
			msg: 'webauthn-demo counter regression',
			CounterRegression: 1,
		}));
	} catch (emfErr) {
		console.error('emf emit failed', { err: emfErr?.message });
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
	if (!session) {
		emitSessionMissMetric();
		return errorResponse(400, 'unknown or expired session');
	}

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
		console.error('registration verify failed', { sessionId, ...errFields(err) });
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

async function authenticationOptionsHandler() {
	// Discoverable credentials (allowCredentials: []) — the authenticator
	// surfaces which credential to use, so no caller-supplied userHandle is
	// needed here. The verified userHandle comes from the stored credential
	// looked up by response.id in authenticationVerifyHandler.
	const options = await generateAuthenticationOptions({
		rpID: RP_ID,
		userVerification: 'preferred',
		allowCredentials: [],
	});

	const sessionId = newSessionId();
	await putSession(sessionId, {
		type: 'authentication',
		challenge: options.challenge,
	});

	return jsonResponse(200, { sessionId, options });
}

async function authenticationVerifyHandler(body) {
	const { sessionId, response } = body;
	if (!response || typeof response !== 'object') {
		return errorResponse(400, 'missing response');
	}
	const session = await takeSession(sessionId, 'authentication');
	if (!session) {
		emitSessionMissMetric();
		return errorResponse(400, 'unknown or expired session');
	}

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
		console.error('authentication verify failed', { sessionId, ...errFields(err) });
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
	} catch (err) {
		console.warn('webauthn-demo originMatches parse failed', errFields(err));
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

	// The Function URL is public (authorization_type = NONE) because OAC
	// SigV4 can't carry a browser POST body — see infra/csp_report.tf for the
	// same constraint. CloudFront injects a high-entropy x-origin-secret
	// custom header; reject anything lacking the match so the direct
	// Function-URL bypass is closed and only CloudFront-proxied requests run.
	// This gate runs before the method check so the raw Function URL answers
	// any request lacking the secret with a uniform 403 regardless of method —
	// a direct caller can't tell a method mismatch (405) from a missing secret
	// and so can't learn that POST is the expected method.
	if (!secretMatches(header(event?.headers, 'x-origin-secret'))) {
		// Direct-to-Function-URL probing is the signal this logs/meters:
		// every legitimate request arrives via CloudFront with the secret,
		// so a mismatch means someone found the raw *.lambda-url host and
		// is calling it directly. Mirrors csp_report's logged rejection.
		console.warn(JSON.stringify({
			level: 'warn',
			msg: 'webauthn-demo origin-secret mismatch',
		}));
		emitOriginSecretMismatchMetric();
		return { statusCode: 403, body: '' };
	}

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
		console.error('handler error', { path, ...errFields(err) });
		return errorResponse(500, 'internal error');
	}
};

function normalizePath(p) {
	if (typeof p !== 'string') return '/';
	// Strip a trailing slash (except for the root), then the CloudFront
	// /api/passkey route prefix so the path matches the ROUTES keys.
	let path = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
	if (path === ROUTE_PREFIX) return '/';
	if (path.startsWith(`${ROUTE_PREFIX}/`)) path = path.slice(ROUTE_PREFIX.length);
	return path;
}

// Exposed for unit tests. Not part of the Lambda contract.
export const __test = {
	originMatches,
	parseBody,
	normalizePath,
	secretMatches,
	header,
	ROUTES,
	updateCredentialCounter,
	credentialDiscriminator,
	errFields,
};
