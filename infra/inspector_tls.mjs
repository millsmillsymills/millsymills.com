// Lambda for /api/tls/inspect — invoked through CloudFront. CloudFront's
// origin-request policy `Managed-AllViewerAndCloudFrontHeaders-2022-06`
// forwards `cloudfront-viewer-tls`, which contains
// `<negotiated_protocol>:<cipher>:<sni>` (per the CloudFront docs). We
// parse that and return JSON; the inspector page renders it inline.
//
// No request body, no path-param parsing, no auth. The headers are the
// only meaningful input; any path under /api/tls/* lands here.
//
// The CloudFront-OAC + Lambda Function URL `AWS_IAM` auth combo (see
// PR #343 / `infra/inspector_tls.tf`) is the load-bearing security
// control: the raw Function URL is unreachable to anyone but the
// distribution's CloudFront service principal. The defense-in-depth
// guards below are second-layer protection — they kick in if a future
// Terraform refactor accidentally toggles `authorization_type = NONE`
// or a future origin policy forwards extra headers from the viewer.

const ALLOWED_ORIGINS = new Set([
	'https://millsymills.com',
	'https://www.millsymills.com',
]);

// Cap the raw header at a length the CloudFront-injected value never
// reaches in practice (`TLSv1.3:TLS_AES_256_GCM_SHA384:millsymills.com`
// is ~50 bytes). 256B is a comfortable ceiling that still bounds the
// memory cost of any future per-component validation.
const MAX_RAW_LEN = 256;

// Each parsed component is a TLS protocol/cipher/SNI token — RFC-defined
// shapes are alphanumerics plus `._-`. Anything else is dropped.
const COMPONENT_RE = /^[A-Za-z0-9._-]{0,128}$/;

function pickAllowOrigin(headers) {
	const origin = headers?.origin ?? headers?.Origin;
	if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) return origin;
	return null;
}

function sanitizeComponent(s) {
	return COMPONENT_RE.test(s) ? s : '';
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
	return {
		statusCode,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...extraHeaders,
		},
		body: JSON.stringify(body),
	};
}

export const handler = async (event) => {
	const headers = event?.headers ?? {};
	const tlsRaw = String(headers['cloudfront-viewer-tls'] ?? '').slice(0, MAX_RAW_LEN);

	// Presence guard: if the CloudFront-OAC layer is correctly wired the
	// header is always set; absence means either a direct Function URL
	// hit (which the AWS-layer auth should already block) or a regression
	// that turned off the OAC enforcement. Refuse rather than serve a
	// "everything blank" 200 that masks the regression.
	if (!tlsRaw) {
		return jsonResponse(403, { error: 'missing cloudfront-viewer-tls' });
	}

	const [protocol = '', cipher = '', sni = ''] = tlsRaw
		.split(':')
		.map(sanitizeComponent);

	const corsOrigin = pickAllowOrigin(headers);
	const corsHeaders = corsOrigin
		? { 'access-control-allow-origin': corsOrigin, vary: 'origin' }
		: {};

	// Drop the raw header from the response body — clients only ever use
	// the parsed components, and reflecting attacker-influenced bytes back
	// in the response is unnecessary surface for any future renderer that
	// might evolve away from text/JSON.
	return jsonResponse(
		200,
		{
			protocol,
			cipher,
			sni,
			ts: new Date().toISOString(),
		},
		corsHeaders,
	);
};
