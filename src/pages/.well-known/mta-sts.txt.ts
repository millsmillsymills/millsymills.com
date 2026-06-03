import type { APIRoute } from 'astro';

// RFC 8461 MTA-STS policy file -- served from /.well-known/mta-sts.txt.
//
// Lives under the apex AND under mta-sts.<domain> because both are
// CloudFront aliases of the same distribution (see infra/cloudfront.tf
// `aliases`). Senders fetch this file from
// `https://mta-sts.<domain>/.well-known/mta-sts.txt` after seeing the
// `_mta-sts.<domain>` TXT record published by `infra/mta_sts.tf`.
//
// Mode:
//   * `testing` -- senders log policy mismatches via TLS-RPT but
//     still deliver. This is the safe rollout default per RFC 8461 §5.
//   * `enforce` -- senders refuse delivery on policy mismatch. Flip
//     here only after 2-4 weeks of clean TLS-RPT reports show
//     `policy-type: sts` (vs `no-policy-found`). When you flip mode,
//     bump `mta_sts_id` in the matching stack's tfvars so cached
//     policies refresh.
//   * `none` -- legacy / rollback signal. Senders treat the domain as
//     not advertising MTA-STS. Reversal in enforce mode is asymmetric:
//     publish `mode: none` here AND wait `max_age` BEFORE removing the
//     `_mta-sts` TXT record in Terraform, otherwise enforcing senders
//     refuse delivery during the rollback window.
//
// `mx:` lines are the Proton standard hosts for the millsymills stack
// (Mail Plus and up; see https://proton.me/support/custom-domain).

export const GET: APIRoute = () => {
	const body = [
		'version: STSv1',
		'mode: testing',
		'mx: mail.protonmail.ch',
		'mx: mailsec.protonmail.ch',
		// RFC 8461 §3.2 SHOULDs max_age >= 604800 (7 days) — applied
		// once the testing-mode rollout was confirmed stable. Promotion
		// from testing -> enforce remains pending on 2-4 weeks of clean
		// TLS-RPT reports; until that flip, max_age controls how long
		// senders cache the testing policy, not enforcement window.
		'max_age: 604800',
		'',
	].join('\n');

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
