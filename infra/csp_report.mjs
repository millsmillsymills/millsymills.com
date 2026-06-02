// Lambda for /api/csp-report — invoked through CloudFront. Browsers POST
// CSP violation reports here in one of two shapes:
//
//   * `Content-Type: application/reports+json` — Reporting API payload
//     (an array of report objects, one per violation). Modern browsers
//     send this when the response carries a `Reporting-Endpoints` header
//     and the CSP includes `report-to csp`.
//   * `Content-Type: application/csp-report` — legacy `report-uri`
//     payload (single object under `csp-report`). Older browsers send
//     this when the CSP includes `report-uri /api/csp-report`.
//
// Both formats are accepted; the body is appended to S3 verbatim with
// a small envelope (`receivedAt`, `reportType`, `userAgent`,
// `viewerCountry`) so downstream tooling can distinguish formats
// without re-parsing the payload. The viewer's full IP is intentionally
// NOT captured here — CloudFront access logs already retain it at 90d
// (see `infra/cloudfront_logging.tf`); duplicating it into a separate
// 30d bucket would over-collect for the same diagnostic value.
// No CORS — reports are same-origin POSTs.
//
// The Function URL is public (authorization_type = NONE) because OAC SigV4
// can't carry a browser-supplied POST body. To close the direct-bypass path,
// CloudFront injects a high-entropy `x-origin-secret` custom_header and this
// handler rejects (403) any request whose header doesn't match the
// `ORIGIN_SECRET` env var. So only CloudFront-proxied reports reach S3.
//
// Cost guards:
//   * `aws_lambda_function.csp_report` ships with `reserved_concurrent_executions = 5`
//     in `infra/csp_report.tf` so a flood of reports cannot blow the bill.
//   * `MAX_BODY_BYTES = 16384` rejects oversize payloads at 413 before
//     the S3 write.

import { randomUUID, timingSafeEqual } from 'node:crypto';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.REPORT_BUCKET;
if (!BUCKET) {
	throw new Error('REPORT_BUCKET env var is required');
}
const ORIGIN_SECRET = process.env.ORIGIN_SECRET;
if (!ORIGIN_SECRET) {
	throw new Error('ORIGIN_SECRET env var is required');
}
const ORIGIN_SECRET_BYTES = Buffer.from(ORIGIN_SECRET, 'utf-8');
const MAX_BODY_BYTES = 16_384;

const ACCEPTED_CONTENT_TYPES = new Set([
	'application/reports+json',
	'application/csp-report',
	'application/json', // some browsers (older Firefox) send this for report-uri
]);

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
// length mismatch), and the actual byte compare is timing-safe so a direct
// caller can't recover the secret one character at a time.
function secretMatches(candidate) {
	if (typeof candidate !== 'string') return false;
	const candidateBytes = Buffer.from(candidate, 'utf-8');
	if (candidateBytes.length !== ORIGIN_SECRET_BYTES.length) return false;
	return timingSafeEqual(candidateBytes, ORIGIN_SECRET_BYTES);
}

function pad2(n) {
	return String(n).padStart(2, '0');
}

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Structured single-line log for pre-write rejections. The endpoint is a
// public Function URL, so a steady trickle of bot/fuzzer junk is expected
// and stays queryable in Logs Insights without paging. The one path worth
// alarming on is `reason = "malformed-report"`: a sustained spike there
// means a browser's report format drifted and legitimate violation reports
// are now being dropped before the S3 write -- the silent failure the
// bucket-cap and put-failed alarms exist to prevent. `shapeHint` is an
// allow-listed structural summary (top-level type / key names), never the
// raw body, so a report-format drift can be diagnosed without persisting or
// logging viewer-supplied content.
function logRejection(reason, contentType, shapeHint) {
	console.warn(JSON.stringify({
		level: 'warn',
		msg: 'csp-report rejected',
		reason,
		contentType,
		shapeHint: shapeHint ?? null,
	}));
}

// Bounded structural summary of a parsed body for the malformed-report log
// line: the top-level JSON type plus, for objects, the sorted key names
// (capped). Values are never included, so no viewer-supplied content leaks
// into the logs -- only the shape that drifted.
function shapeHintOf(parsed) {
	if (Array.isArray(parsed)) return `array[${parsed.length}]`;
	if (parsed === null) return 'null';
	if (typeof parsed !== 'object') return typeof parsed;
	return `object{${Object.keys(parsed).sort().slice(0, 8).join(',')}}`.slice(0, 200);
}

// Top-level shape per accepted content type:
//   * `application/reports+json`  — Reporting API: array of report objects.
//   * `application/csp-report`    — legacy report-uri: { "csp-report": {...} }.
//   * `application/json`          — older Firefox quirk for report-uri,
//                                   same `{csp-report: {...}}` shape.
// Anything else is rejected at 400 before it lands in S3.
function isWellFormedReport(contentType, parsed) {
	if (contentType === 'application/reports+json') {
		// `[].every(...)` is `true`, so the array-emptiness guard must be
		// explicit -- an empty reports array carries no signal and should
		// not persist a zero-value envelope to S3.
		if (!Array.isArray(parsed) || parsed.length === 0) return false;
		return parsed.every(isPlainObject);
	}
	if (contentType === 'application/csp-report' || contentType === 'application/json') {
		return isPlainObject(parsed) && isPlainObject(parsed['csp-report']);
	}
	return false;
}

function objectKey(now, requestId) {
	const yyyy = now.getUTCFullYear();
	const mm = pad2(now.getUTCMonth() + 1);
	const dd = pad2(now.getUTCDate());
	const hh = pad2(now.getUTCHours());
	const mi = pad2(now.getUTCMinutes());
	const ss = pad2(now.getUTCSeconds());
	const safeId = String(requestId).replace(/[^a-zA-Z0-9_-]/g, '_');
	return `reports/${yyyy}/${mm}/${dd}/${hh}${mi}${ss}-${safeId}.json`;
}

export const handler = async (event) => {
	const method = event?.requestContext?.http?.method ?? 'GET';
	if (method !== 'POST') {
		return { statusCode: 405, headers: { allow: 'POST' }, body: '' };
	}

	const headers = event?.headers ?? {};
	if (!secretMatches(header(headers, 'x-origin-secret'))) {
		logRejection('origin-secret-mismatch', null);
		return { statusCode: 403, body: '' };
	}

	const contentType = String(header(headers, 'content-type') ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
		logRejection('unsupported-content-type', contentType);
		return { statusCode: 415, body: '' };
	}

	const rawBody = event?.body ?? '';
	const body = event?.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody;
	const bodyBytes = Buffer.byteLength(body, 'utf-8');
	if (bodyBytes > MAX_BODY_BYTES) {
		// Structured log so a CloudWatch metric filter can surface abuse:
		// a flood of oversize bodies is a DoS signal, not a quiet 413.
		console.warn(JSON.stringify({
			level: 'warn',
			msg: 'csp-report body cap exceeded',
			bytes: bodyBytes,
			max: MAX_BODY_BYTES,
		}));
		return { statusCode: 413, body: '' };
	}

	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
		logRejection('invalid-json', contentType);
		return { statusCode: 400, body: '' };
	}

	// Top-level shape check per content type. The Function URL is public;
	// the origin shared-secret check above is the primary gate, and this
	// shape check is the secondary one -- together they keep anything that
	// isn't a real browser report from persisting. Downstream tooling
	// (CloudWatch Insights, future analytics) also relies on the shape
	// contract, so reject anything that isn't the shape the matching
	// browser format actually emits.
	if (!isWellFormedReport(contentType, parsed)) {
		logRejection('malformed-report', contentType, shapeHintOf(parsed));
		return { statusCode: 400, body: '' };
	}

	const now = new Date();
	const envelope = {
		receivedAt: now.toISOString(),
		reportType: contentType,
		userAgent: header(headers, 'user-agent') ?? null,
		viewerCountry: header(headers, 'cloudfront-viewer-country') ?? null,
		report: parsed,
	};

	// Function URL events always carry a requestId; the fallback is
	// belt-and-suspenders for non-FunctionURL invocations (e.g. local
	// tests) where two same-millisecond calls would otherwise collide
	// on the same S3 object key.
	const requestId = event?.requestContext?.requestId ?? `${now.getTime()}-${randomUUID()}`;
	const key = objectKey(now, requestId);

	try {
		await s3.send(
			new PutObjectCommand({
				Bucket: BUCKET,
				Key: key,
				Body: JSON.stringify(envelope),
				ContentType: 'application/json',
			}),
		);
	} catch (err) {
		// Structured single-line log so CloudWatch Logs Insights can
		// distinguish S3-throttle / IAM-misconfig / transient-network
		// failures from a code-level uncaught exception. Browsers drop
		// CSP reports on any non-2xx, so the loss is unavoidable here;
		// the log line is the only way to count + alarm the failures.
		console.error(JSON.stringify({
			level: 'error',
			msg: 'csp-report s3 put failed',
			bucket: BUCKET,
			key,
			errName: err?.name,
			errCode: err?.Code ?? err?.code,
		}));
		return { statusCode: 500, body: '' };
	}

	return { statusCode: 204, body: '' };
};
