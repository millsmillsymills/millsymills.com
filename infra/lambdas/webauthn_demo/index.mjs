// Stub Lambda for the WebAuthn / passkey demo backend (issue #140).
//
// This is the infra-slice scaffold only -- the function URL + DynamoDB
// table + IAM role ship empty so the wiring can be reviewed and
// validated end-to-end before the real handler lands. The real
// registration + authentication flows (using `@simplewebauthn/server`,
// origin-bound to var.domain, with the documented credential schema)
// arrive in the logic-slice followup PR tracked under issue #140.
//
// Until then this handler returns a 200 placeholder so the Function URL
// is exercisable, and ignores the DynamoDB table entirely.

export const handler = async () => {
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			ok: true,
			note: 'stub -- webauthn demo backend not yet implemented (see issue #140)',
		}),
	};
};
