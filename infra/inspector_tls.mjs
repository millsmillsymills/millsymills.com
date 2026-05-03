// Lambda for /api/tls/inspect — invoked through CloudFront. CloudFront's
// origin-request policy `Managed-AllViewerAndCloudFrontHeaders-2022-06`
// forwards `cloudfront-viewer-tls`, which contains
// `<negotiated_protocol>:<cipher>:<sni>` (per the CloudFront docs). We
// parse that and return JSON; the inspector page renders it inline.
//
// No request body, no path-param parsing, no auth. The headers are the
// only meaningful input; any path under /api/tls/* lands here.

const ALLOWED_ORIGINS = new Set([
	'https://millsymills.com',
	'https://www.millsymills.com',
	'https://p41m0n.com',
	'https://www.p41m0n.com',
]);

function pickAllowOrigin(headers) {
	const origin = headers?.origin ?? headers?.Origin;
	if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) return origin;
	return null;
}

export const handler = async (event) => {
	const headers = event?.headers ?? {};
	const tlsRaw = headers['cloudfront-viewer-tls'] ?? '';
	const [protocol = '', cipher = '', sni = ''] = String(tlsRaw).split(':');

	const corsOrigin = pickAllowOrigin(headers);
	const responseHeaders = {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	};
	if (corsOrigin) {
		responseHeaders['access-control-allow-origin'] = corsOrigin;
		responseHeaders['vary'] = 'origin';
	}

	const body = {
		protocol,
		cipher,
		sni,
		raw: tlsRaw,
		ts: new Date().toISOString(),
	};

	return {
		statusCode: 200,
		headers: responseHeaders,
		body: JSON.stringify(body),
	};
};
