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
// Cost guards:
//   * `aws_lambda_function.csp_report` ships with `reserved_concurrent_executions = 5`
//     in `infra/csp_report.tf` so a flood of reports cannot blow the bill.
//   * `MAX_BODY_BYTES = 16384` rejects oversize payloads at 413 before
//     the S3 write.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.REPORT_BUCKET;
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

function objectKey(now, requestId) {
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(now.getUTCDate()).padStart(2, '0');
	const hms = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
	return `reports/${yyyy}/${mm}/${dd}/${hms}-${requestId}.json`;
}

export const handler = async (event) => {
	const method = event?.requestContext?.http?.method ?? 'GET';
	if (method !== 'POST') {
		return { statusCode: 405, headers: { allow: 'POST' }, body: '' };
	}

	const headers = event?.headers ?? {};
	const contentType = String(header(headers, 'content-type') ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
		return { statusCode: 415, body: '' };
	}

	const rawBody = event?.body ?? '';
	const body = event?.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody;
	if (Buffer.byteLength(body, 'utf-8') > MAX_BODY_BYTES) {
		return { statusCode: 413, body: '' };
	}

	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
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

	const requestId = event?.requestContext?.requestId ?? `${now.getTime()}`;
	const key = objectKey(now, requestId);

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: JSON.stringify(envelope),
			ContentType: 'application/json',
		}),
	);

	return { statusCode: 204, body: '' };
};
