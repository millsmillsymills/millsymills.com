/*
 * Source of truth for the /security page. Every control we ship gets an
 * entry here; the page renders from this list rather than hand-edited
 * markup so adding a control is a one-file change with auto-grouping.
 *
 * Keep claims accurate and link to real source. The page's whole credibility
 * is "every claim cites the implementation." A wrong link or a claim that's
 * better-than-truth is worse than no page at all.
 *
 * When you ship a new control:
 *   1. Add an entry below in the appropriate category.
 *   2. Set status — `shipped` (live in main + deployed), or `roadmap`
 *      (planned/spec'd, not yet live).
 *   3. Cite at least one `code` link to the actual implementation file
 *      so a reviewer can verify rather than trust.
 */

export type ControlStatus = 'shipped' | 'roadmap';

export type ControlCategory =
	| 'web'
	| 'dns'
	| 'email'
	| 'supply-chain'
	| 'monitoring'
	| 'identity'
	| 'privacy';

export interface SecurityControl {
	readonly id: string;
	readonly title: string;
	readonly category: ControlCategory;
	readonly status: ControlStatus;
	/** One-line "what does it do." */
	readonly what: string;
	/** Why we shipped it — threat model, attack class, or property gained. */
	readonly why: string;
	/** Honest tradeoffs, caveats, or known limits. Empty if there are none worth flagging. */
	readonly tradeoffs?: string;
	/**
	 * Repo paths that implement the control. Rendered as links to GitHub.
	 * Optional because roadmap entries don't have an implementation to
	 * cite yet — `code: []` would be sentinel-as-required-field, the
	 * absence-of-key form expresses "not yet shipped" more honestly.
	 */
	readonly code?: readonly string[];
	/** PR numbers (just the digits) that landed the control. Rendered as links to GitHub PRs. */
	readonly prs?: readonly number[];
	/** External verification link (dnsviz, securityheaders, mxtoolbox, etc.). */
	readonly verify?: { readonly label: string; readonly href: string };
}

export const CATEGORY_LABELS: Record<ControlCategory, string> = {
	web: 'web platform',
	dns: 'dns + domain',
	email: 'email auth',
	'supply-chain': 'supply chain',
	monitoring: 'monitoring',
	identity: 'identity + contact',
	privacy: 'privacy',
};

// Repo URL is hardcoded rather than imported from privacy-copy to keep the
// /security page survivable if privacy-copy ever moves; the URL is also a
// branding/identity claim that shouldn't drift across files.
export const REPO_URL = 'https://github.com/millsmillsymills/millsymills.com';

export const REPO_BLOB_URL = `${REPO_URL}/blob/main`;

export const securityControls: readonly SecurityControl[] = [
	// ─── web platform ──────────────────────────────────────────────────
	{
		id: 'hsts',
		title: 'HSTS (with preload)',
		category: 'web',
		status: 'shipped',
		what: '`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every response.',
		why: 'Once a browser has seen the header it refuses plain-HTTP for two years; the `preload` flag advertises eligibility for the browser-shipped HSTS preload list, which closes the first-visit TLS-stripping window.',
		tradeoffs: 'Submission to https://hstspreload.org/ is a separate manual step (#127). Header is shipping with `preload` already, so the eligibility check passes whenever you submit.',
		code: ['infra/cloudfront.tf'],
	},
	{
		id: 'security-headers',
		title: 'CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors',
		category: 'web',
		status: 'shipped',
		what: 'CloudFront response-headers policy injects a strict CSP (`default-src \'self\'`, `object-src \'none\'`, `upgrade-insecure-requests`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and SAMEORIGIN frame-ancestors on every response.',
		why: 'Defense-in-depth against XSS, MIME sniffing, leaky referrers, and clickjacking. The CSP allow-list is intentionally tight — no third-party origins anywhere.',
		tradeoffs: '`style-src \'self\' \'unsafe-inline\'` is the one knowing concession to make Astro\'s scoped styles work; tightening to nonces is tracked as #129. `script-src` is `\'self\'` with no inline allowance — every bundled script stays external and covered by `\'self\'`; `scripts/assert-no-stray-inline-scripts.mjs` fails CI if any executable inline script ships that the CSP would block. Violation reporting is wired separately as `csp-reporting` below.',
		code: ['infra/cloudfront.tf', 'scripts/assert-no-stray-inline-scripts.mjs'],
	},
	{
		id: 'tls-pqc',
		title: 'TLS 1.3-only with hybrid post-quantum key agreement',
		category: 'web',
		status: 'shipped',
		what: 'CloudFront security policy is `TLSv1.3_2025`, which floors viewer connections at TLS 1.3 and auto-negotiates `X25519MLKEM768` / `SecP256r1MLKEM768` hybrid post-quantum key agreement when the client offers it. PQC is enabled by AWS on every TLS 1.3 connection — flooring the protocol guarantees every viewer is eligible.',
		why: 'Harvest-now-decrypt-later: an adversary recording today\'s ciphertext could decrypt it once a cryptanalytically relevant quantum computer exists. Hybrid key agreement combines a classical curve (X25519) with a post-quantum KEM (ML-KEM-768) so the session key is safe as long as either remains unbroken — defense before the threat is operational, not after.',
		tradeoffs: 'TLS 1.3 floor excludes Chrome <70 (Oct 2018), Firefox <63 (Oct 2018), and Safari <14 (Sep 2020) — Safari 12 + 13 are out even though they shipped in the 2018–2020 window. PQC handshakes add ~1.6KB and ~80–150µs per connection; only viewers that already speak ML-KEM-768 actually negotiate it (most major browsers and OpenSSL 3.5+ in 2025–2026, still rolling out). Verify post-cutover with `openssl s_client -connect millsymills.com:443 -groups X25519MLKEM768 2>/dev/null </dev/null | grep "Server Temp Key"` (requires openssl ≥ 3.5); expected output is `Server Temp Key: X25519MLKEM768`.',
		code: ['infra/cloudfront.tf'],
		verify: {
			label: 'ssllabs.com TLS report',
			href: 'https://www.ssllabs.com/ssltest/analyze.html?d=millsymills.com',
		},
	},
	{
		id: 'permissions-policy',
		title: 'Permissions-Policy (powerful features denied by default)',
		category: 'web',
		status: 'shipped',
		what: 'CloudFront response-headers policy ships a strict-deny `Permissions-Policy` that blocks 36 powerful features — camera, microphone, geolocation, USB / Serial / HID / MIDI / Bluetooth, clipboard read/write, payment, fullscreen, screen-wake-lock, WebAuthn `publickey-credentials-*`, FLoC/Topics, otp-credentials, attribution-reporting, window-management, local-fonts, unload, and the rest of the W3C catalog — for both top-level and embedded contexts. A CI lint rejects any directive that deviates from `=()` (deny) or `=(self)` (self-allow), so a future "fix" that flips to `=*` fails CI. The `/demo/passkey/*` cache behavior overrides only the two `publickey-credentials-*` directives to `=(self)` via a sibling response-headers policy (`aws_cloudfront_response_headers_policy.passkey_demo`); every other directive remains denied, including on the demo path.',
		why: 'The site has zero JavaScript use of any powerful API (verified by greppping `navigator.*` in `src/`), so the strict-deny baseline ships without breaking anything visitors actually use. Closing every feature the site does not need turns silent permission requests into hard `Permission denied` failures, narrows the impact radius of a future XSS, and makes the inspector\'s self-grading honest — previously the site failed its own `Permissions-Policy` check.',
		tradeoffs: 'Features that legitimately need a powerful API (the live WebAuthn passkey demo at `/demo/passkey`, a future theater-mode fullscreen) must extend this policy in the same PR; otherwise the API call no-ops silently. The policy does not rate-limit — it\'s a strict allow-list, not a runtime gate.',
		code: ['infra/cloudfront.tf', 'scripts/assert-permissions-policy.sh'],
		verify: {
			label: 'securityheaders.com report',
			href: 'https://securityheaders.com/?q=millsymills.com&followRedirects=on',
		},
	},
	{
		id: 'coop-coep',
		title: 'Cross-origin isolation (COOP / COEP / CORP)',
		category: 'web',
		status: 'shipped',
		what: '`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin` on every document response. The `/api/tls/*` JSON endpoint uses a separate response-headers policy with `Cross-Origin-Resource-Policy: cross-origin` so allowlisted cross-origin callers can fetch it from a COEP-isolated document; the CORS allowlist in `inspector_tls.mjs` remains the access boundary. The same-origin-only `/api/passkey/*` endpoint keeps `Cross-Origin-Resource-Policy: same-origin` via its own dedicated policy — it has no cross-origin caller, so it stays as tight as a document response.',
		why: 'Closes Spectre-class side channels and cross-origin window-reference leaks. The combination puts the document in a cross-origin isolated agent cluster, also unlocking precision-timer + SharedArrayBuffer features if we ever need them.',
		tradeoffs: 'COEP `require-corp` is the strict variant — every cross-origin subresource has to opt in via CORP/CORS. Site is fully self-hosted (no third-party scripts, fonts, images, or iframes; `assert-fonts-csp.sh` keeps it that way), so the strict variant ships without breaking anything. Same-origin CORP also blocks third-party hot-linking of static assets. The API-policy carve-out is intentional — JSON responses are not documents, so COOP/COEP do not apply, and CSP is ignored by browsers on `application/json`.',
		code: ['infra/cloudfront.tf', 'scripts/assert-coop-coep-corp.sh'],
		verify: {
			label: 'securityheaders.com report',
			href: 'https://securityheaders.com/?q=millsymills.com&followRedirects=on',
		},
	},
	{
		id: 'sri-gate',
		title: 'SRI lint on cross-origin assets',
		category: 'web',
		status: 'shipped',
		what: 'CI lint refuses to ship `dist/` if any `<script src>`, stylesheet/preload `<link href>`, importmap entry, or CSS `@import` points at a non-allowlisted host without `integrity` + `crossorigin` (or, for importmap and `@import` which have no SRI surface, at all).',
		why: 'Site is fully self-hosted today — no third-party JS/CSS. The lint is forward-pressure: a future dependency that adds a CDN reference trips the build instead of silently undermining the "no third-party JS or CSS" posture.',
		tradeoffs: 'Same-origin assets are exempt — Astro\'s hashed bundles are already integrity-protected by URL versioning + the OAC pipeline. Astro 6 does not emit SRI hashes natively; if a cross-origin asset ever lands here, the integrity attribute has to be added by hand or by a postbuild pass.',
		code: ['scripts/assert-sri-on-cross-origin-assets.mjs'],
	},
	{
		id: 'csp-reporting',
		title: 'CSP violation reporting endpoint',
		category: 'web',
		status: 'shipped',
		what: 'CSP carries `report-uri /api/csp-report; report-to csp` and the response ships `Reporting-Endpoints: csp="https://<domain>/api/csp-report"`. Browsers POST violation reports (both legacy `application/csp-report` and modern `application/reports+json`) through CloudFront to a Lambda Function URL; the handler validates Content-Type, caps body size at 16KB, and writes the report (plus a small envelope: `receivedAt`, `userAgent`, `viewerCountry`) to S3 as JSON. Reports auto-expire after 30 days via a bucket lifecycle rule.',
		why: 'A Report-Only rollout is only useful if reports go somewhere. Capturing violations becomes a prerequisite for tightening CSP without breaking the site — the strict-CSP-with-nonces rollout (#129) and Trusted Types enforcement (#130) both depend on this telemetry layer to surface regressions before flipping enforcement on.',
		tradeoffs: 'Cost cap is `reserved_concurrent_executions = 5` on the Lambda — a flood of reports gets throttled rather than driving up the bill. Unlike the other Lambda endpoints, this Function URL is public (`authorization_type = NONE`), not CloudFront-OAC-locked: OAC SigV4 can\'t carry a browser-supplied POST body, so an OAC-fronted report endpoint returns 403 for every browser report. To close the direct-bypass path, CloudFront injects a high-entropy `x-origin-secret` custom header and the handler rejects (403) any request lacking it — so only CloudFront-proxied reports reach S3. It is a write-only sink — 204 with no body, Content-Type/size/concurrency capped, no read or enumerate path — so a publicly reachable URL exposes no data. No dashboard yet — reports are queryable directly out of the S3 bucket via Athena or `aws s3 cp` until violation volume justifies more.',
		code: [
			'infra/csp_report.tf',
			'infra/csp_report.mjs',
			'infra/cloudfront.tf',
		],
		prs: [355],
	},
	{
		id: 'inspector',
		title: 'live security-headers + TLS inspector',
		category: 'web',
		status: 'shipped',
		what: 'The `/inspector/` desktop app fetches the site\'s own response headers in-browser and grades them against the active CloudFront response-headers policy. A small Lambda behind CloudFront also exposes the negotiated TLS protocol, cipher, and SNI for the user→CloudFront connection at `/api/tls/inspect`. The Lambda Function URL is locked to `AWS_IAM` auth and a CloudFront Origin Access Control, so the only path to it is through the CloudFront distribution — direct calls to the raw `<id>.lambda-url.<region>.on.aws` endpoint return 403, preserving every CloudFront-applied security header on the response.',
		why: 'The /security page documents what *should* be deployed; the inspector lets a visitor verify what *is* deployed in real time. Drift between the two becomes immediately observable instead of silently aging.',
		tradeoffs: 'The TLS-inspector Lambda reads `CloudFront-Viewer-TLS` from the origin-request headers, so it reflects the user→CloudFront leg only — it cannot see anything about the CloudFront→origin leg. That\'s the leg the visitor cares about, but worth being explicit about. astro preview lacks CloudFront headers so all rows grade F locally; on prod every row should grade A.',
		code: [
			'src/components/desktop/apps/Inspector.astro',
			'infra/inspector_tls.tf',
			'infra/inspector_tls.mjs',
			'infra/cloudfront.tf',
		],
		prs: [302],
	},
	{
		id: 'passkey-demo',
		title: 'WebAuthn passkey demo backend',
		category: 'web',
		status: 'shipped',
		what: 'The `/demo/passkey` page runs real WebAuthn registration + authentication ceremonies against a `@simplewebauthn/server` Lambda behind CloudFront at `/api/passkey/*`. Challenges, the credential public key, and the signature counter live in DynamoDB with short TTLs (5-minute in-flight sessions, 24-hour credentials) and no PII — `userID` is a synthetic random handle, not an account. Authentication uses discoverable credentials (`allowCredentials: []`), so the authenticator chooses which key to present.',
		why: 'A passkey demo that mock-signs in the browser proves nothing. Wiring the page to a real server-side verifier (challenge issuance, origin/RP-ID binding, signature-counter clone detection) makes it an honest demonstration of the ceremony — and exercises the same Permissions-Policy `publickey-credentials-*=(self)` carve-out the site documents.',
		tradeoffs: 'Like the CSP-report endpoint, this Function URL is public (`authorization_type = NONE`) rather than OAC-locked, because OAC SigV4 can\'t carry a browser POST body and every WebAuthn route is POST. CloudFront injects a high-entropy `x-origin-secret` custom header and the handler rejects (403) any request lacking it — constant-time compared, evaluated before the method check so a direct caller gets a uniform 403. A 403-rate CloudWatch alarm (`OriginSecretMismatch`, mirroring `SessionMiss`, `CounterRegression`, and `OriginParseFailure`) surfaces sustained direct-to-Function-URL probing. Body size, content type, and `reserved_concurrent_executions` are capped; signature-counter regressions page immediately as a clone signal.',
		code: [
			'src/scripts/passkey-demo.ts',
			'src/pages/demo/passkey.astro',
			'infra/webauthn_demo.tf',
			'infra/lambdas/webauthn_demo/index.mjs',
			'infra/cloudfront.tf',
		],
		prs: [631],
	},

	// ─── dns + domain ──────────────────────────────────────────────────
	{
		id: 'dnssec',
		title: 'DNSSEC',
		category: 'dns',
		status: 'shipped',
		what: 'KMS-backed key-signing key signs the Route53 zone; the chain to the parent (.com) closes once the DS record is published at the registrar.',
		why: 'Resolvers can verify that the answers they get for `millsymills.com` actually came from the authoritative servers, not a cache-poisoning attacker between you and them. Required prerequisite for DANE TLSA.',
		tradeoffs: 'Reversal is asymmetric — REMOVE the DS at the registrar FIRST, wait for parent TTL (.com is up to ~24h on the DS RRset), THEN disable Terraform signing. Doing it in the wrong order takes ~50% of validating resolvers offline until the cached DS expires. Terraform-level `prevent_destroy` guards on the KSK + KMS key (PR #207) are the machine guard for the documented protocol; PR #213 pre-stages the rotation block so the planned-rotation procedure is uncomment-and-apply, not invent-Terraform-mid-incident; PR #212 documents an emergency-response path that disables the suspected key immediately rather than dual-publishing.',
		code: ['infra/dnssec.tf'],
		prs: [201, 207, 212, 213],
		verify: { label: 'dnsviz.net', href: 'https://dnsviz.net/d/millsymills.com/dnssec/' },
	},
	{
		id: 'caa',
		title: 'CAA records',
		category: 'dns',
		status: 'shipped',
		what: 'Four `0 issue` records covering AWS\'s documented CAA identifiers (`amazon.com`, `amazontrust.com`, `awstrust.com`, `amazonaws.com`) plus `0 issuewild ";"` to forbid wildcards entirely. TTL 300s for fast misconfig recovery during cutover.',
		why: 'A CA that doesn\'t see itself in the CAA record is supposed to refuse to issue. Even if an attacker compromises a different CA, they can\'t mint a publicly-trusted cert for the domain. Four-domain coverage future-proofs against AWS rotating which identifier ACM publishes.',
		tradeoffs: 'Iodef reporting is best-effort — not every CA honors it. The `caa_iodef_address` variable defaults to `security@<domain>` so reports land in a real mailbox once Proton is live.',
		code: ['infra/caa.tf'],
		prs: [197, 214],
		verify: { label: 'mxtoolbox.com CAA lookup', href: 'https://mxtoolbox.com/SuperTool.aspx?action=caa%3amillsymills.com' },
	},

	// ─── email auth ────────────────────────────────────────────────────
	{
		id: 'mx-null',
		title: 'MX → Proton (with null-MX fallback when off)',
		category: 'email',
		status: 'shipped',
		what: 'When `protonmail_verification_token` is populated (production state for `millsymills.com`), `MX 10 mail.protonmail.ch.` and `MX 20 mailsec.protonmail.ch.` route inbound to ProtonMail. When the token is blank (pre-activation state), `MX 0 .` (RFC 7505) is published — the explicit "this domain accepts no mail" record — so an in-progress activation never leaves a spoofable gap.',
		why: 'Hard-bounces any spoofing attempt at the SMTP layer instead of silently dropping. The DNS posture is unspoofable from day one, regardless of Proton timeline.',
		code: ['infra/email.tf'],
	},
	{
		id: 'spf',
		title: 'SPF',
		category: 'email',
		status: 'shipped',
		what: '`v=spf1 include:_spf.protonmail.ch -all` (production state for `millsymills.com`). Pre-activation, the fallback is `v=spf1 -all` — no senders authorized at all.',
		why: 'Tells receivers exactly which SMTP origins are allowed to send mail as this domain. The `-all` (hard-fail) is intentional — soft-fail is a polite request, hard-fail is a refusal.',
		code: ['infra/email.tf'],
	},
	{
		id: 'dkim',
		title: 'DKIM (Proton, three rotating selectors)',
		category: 'email',
		status: 'shipped',
		what: 'Three CNAMEs at `<selector>._domainkey.<domain>` (selectors `protonmail`, `protonmail2`, `protonmail3`) point at Proton-hosted DKIM keys. CNAMEs are gated on `proton_enabled` (derived from `protonmail_verification_token`) so an apply without the verification token tears them down alongside the MX/SPF flip — never orphaned.',
		why: 'Aligned DKIM is half of the DMARC strict-reject contract: receivers verify the message signature against a key Proton publishes, and the `d=` domain alignment prevents replay against unrelated senders. Three selectors give Proton room to rotate keys without breaking signing.',
		tradeoffs: 'CNAME targets carry the Proton tenant identifier in the public DNS — anyone correlating DKIM CNAMEs across domains can see they share a Proton account. Acceptable for a single-operator portfolio.',
		code: ['infra/email.tf', 'infra/stacks/millsymills.tfvars'],
	},
	{
		id: 'dmarc',
		title: 'DMARC at p=reject (strict)',
		category: 'email',
		status: 'shipped',
		what: '`v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@<domain>; fo=1; adkim=s; aspf=s` from day one.',
		why: 'Strict alignment + reject means any mail that fails SPF or DKIM (or doesn\'t have aligned identifiers) gets dropped, not quarantined. Proton is the only legitimate sender, so aligned DKIM/SPF should pass on day one — no `p=quarantine` training phase needed.',
		tradeoffs: 'Aggregate reports land at `dmarc@<domain>` — provisioned as a real address on `millsymills.com` per the 2026-05-14 activation spec.',
		code: ['infra/email.tf'],
	},
	{
		id: 'tls-rpt',
		title: 'TLS-RPT (RFC 8460)',
		category: 'email',
		status: 'shipped',
		what: '`_smtp._tls.<domain> TXT "v=TLSRPTv1; rua=mailto:tls-rpt@<domain>"` advertises the daily-aggregate TLS-failure report endpoint.',
		why: 'Sending MTAs publish reports about TLS negotiation failures to inbound mail. Surfaces silent delivery issues; becomes the telemetry layer once MTA-STS rolls out.',
		tradeoffs: 'Aggregate reports land at `tls-rpt@<domain>` — provisioned alongside the rest of the role aliases. First reports arrive ~24h after activation.',
		code: ['infra/email.tf'],
		prs: [202],
	},
	{
		id: 'mta-sts',
		title: 'MTA-STS (RFC 8461)',
		category: 'email',
		status: 'shipped',
		what: 'Publishes `_mta-sts.<domain> TXT "v=STSv1; id=…"` and serves a policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt` listing the Proton MX hosts as the only valid SMTP endpoints. Sending MTAs that respect MTA-STS upgrade opportunistic TLS to enforced TLS for inbound mail.',
		why: 'MTA-STS blocks passive downgrade attacks on inbound SMTP that DNSSEC + DANE alone don\'t cover for senders that don\'t implement DANE (most large providers ship MTA-STS; DANE adoption is narrower). Visible control that peer MTAs can observe via HTTPS, complementing the DNSSEC-rooted DANE chain.',
		tradeoffs: 'Currently in `mode: testing` (`max_age: 604800`, RFC 8461 §3.2 SHOULD floor) on millsymills.com: senders log policy mismatches via TLS-RPT but still deliver, so the rollout is reversible. Promotion to `mode: enforce` follows 2-4 weeks of clean TLS-RPT reports showing `policy-type: sts` — see `docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md` § Future. Reversal in enforce mode is asymmetric: publish `mode: none` AND wait `max_age` BEFORE removing the discovery TXT, otherwise enforcing senders refuse delivery during the rollback window.',
		code: ['infra/mta_sts.tf', 'infra/stacks/millsymills.tfvars', 'src/pages/.well-known/mta-sts.txt.ts'],
	},
	{
		id: 'dane-smtp',
		title: 'DANE for inbound SMTP (RFC 7672)',
		category: 'email',
		status: 'shipped',
		what: 'Inbound SMTP TLS is anchored to DNSSEC, not the web PKI. Per RFC 7672, the TLSA record lives at `_25._tcp.<MX-host>` in the MX host\'s zone — for Proton MX, that\'s `_25._tcp.mail.protonmail.ch` and `_25._tcp.mailsec.protonmail.ch`, which Proton already publishes (`3 1 1 …` SPKI hashes). A sender resolves our DNSSEC-signed MX records, jumps to Proton\'s DNSSEC-signed zone for the TLSA, and refuses delivery if the negotiated cert doesn\'t match. End-to-end DANE works without records in our zone.',
		why: 'Removes the web PKI as a trust anchor for inbound SMTP. A compromised CA cannot issue a fake cert for `mail.protonmail.ch` and intercept inbound mail without also subverting DNSSEC for `protonmail.ch` AND for our domain — the two-zone chain is the bind.',
		tradeoffs: 'Operational only when MX records point at a Proton MX host whose zone publishes TLSA. Once Proton activation completes for a given stack, the property is automatic: we contribute the DNSSEC-signed MX RRset; Proton contributes the TLSA. Switching MX away from Proton to an MX host that doesn\'t publish TLSA would silently demote DANE-aware senders to opportunistic TLS — a hidden trust regression — so MX changes must verify TLSA presence on the new host before flipping. Proton also owns the TLSA rotation cadence; an unannounced re-key would temporarily break inbound delivery.',
		code: ['infra/email.tf', 'infra/dnssec.tf'],
	},

	// ─── supply chain ──────────────────────────────────────────────────
	{
		id: 'oidc-deploy',
		title: 'OIDC-only deploy (no long-lived AWS keys)',
		category: 'supply-chain',
		status: 'shipped',
		what: 'GitHub Actions assumes a per-stack IAM role via `AssumeRoleWithWebIdentity`. The trust policy pins `repo:owner/name`, branch (`main`), and the specific workflow file (`deploy.yml`) via `job_workflow_ref`.',
		why: 'No long-lived AWS access keys ever touch GitHub. A different (or tampered) workflow on the same branch can\'t mint the deploy token; a different repo can\'t either.',
		tradeoffs: 'Adding a new deploy workflow requires a Terraform var bump + apply BEFORE pushing the workflow — `ci-local.sh` checks the referenced file exists so a typo fails locally rather than at AssumeRole time.',
		code: ['infra/github_oidc.tf', '.github/workflows/deploy.yml'],
	},
	{
		id: 'sbom',
		title: 'SBOM published with each deploy',
		category: 'supply-chain',
		status: 'shipped',
		what: 'Every deploy publishes an SPDX SBOM at `/.well-known/sbom.spdx.json` via `anchore/sbom-action`. Regenerated on the monthly cron rebuild too.',
		why: 'Anyone (you, a downstream consumer, a security researcher) can `curl` the live SBOM and diff against vulnerability databases without having to clone the repo or trust a third-party scanner.',
		tradeoffs: 'Action is pinned to `@v0`, not a SHA — consistent with the rest of the workflow but worth a future supply-chain hardening sweep.',
		code: ['.github/workflows/deploy.yml'],
		prs: [199],
	},
	{
		id: 'slsa-cosign',
		title: 'SLSA L3 provenance + sigstore signing',
		category: 'supply-chain',
		status: 'shipped',
		what: 'Each deploy publishes `dist.tar.gz`, a keyless cosign Sigstore bundle (`dist.tar.gz.cosign.bundle` — signature, Fulcio short-lived cert, and Rekor inclusion proof in one file), and a SLSA v1.0 build-L3 provenance attestation (`dist.tar.gz.intoto.jsonl`) under `/.well-known/slsa/`. The provenance is generated by the `slsa-framework/slsa-github-generator` reusable workflow — separate `job_workflow_ref` from the deploy workflow, which is exactly the trusted-builder requirement L3 wants.',
		why: 'Anyone can cryptographically verify that a given dist tarball came from this repo, this commit, and this workflow — without trusting anything beyond the GitHub OIDC issuer and the sigstore transparency log. Independent of S3 / CloudFront / DNS posture, which collectively decide what visitors fetch but not who built it.',
		tradeoffs: 'Verification command is documented in the workflow file, but visitors have to know the OIDC identity (the workflow file path on `refs/heads/main`) to run `cosign verify-blob` correctly. Reusable-workflow version is pinned to a tag (`@v2.1.0`), not a SHA — consistent with the rest of the workflow but worth a hardening sweep alongside the SBOM action pin.',
		code: [
			'.github/workflows/deploy.yml',
		],
		prs: [],
	},
	{
		id: 's3-tls-only',
		title: 'S3 origin + log buckets refuse non-TLS access',
		category: 'supply-chain',
		status: 'shipped',
		what: 'Both `aws_s3_bucket_policy.site` and `aws_s3_bucket_policy.logs` carry an explicit `Deny` on `aws:SecureTransport = false`, alongside the existing CloudFront-OAC and log-delivery allows.',
		why: 'CloudFront OAC, S3 server access logging, and CloudFront log delivery already use TLS, so the realistic failure mode this guards against is a future IAM principal — compromised or overbroad — reaching the buckets over plain HTTP. Industry-baseline finding flagged by most AWS scanners.',
		tradeoffs: 'A `tf.sh millsymills` plan must show the bucket-policy update before merging changes here.',
		code: ['infra/s3.tf'],
	},

	// ─── monitoring ────────────────────────────────────────────────────
	{
		id: 'ct-monitor',
		title: 'CT log monitoring',
		category: 'monitoring',
		status: 'shipped',
		what: 'Daily Lambda polls https://crt.sh for new certificates issued for `millsymills.com` and SAN-related names; anything not from an allow-listed issuer (default: `Amazon`) fires an SNS-email alert.',
		why: 'CAA stops most rogue issuance up front; CT monitoring catches what slipped through (cooperating CA, weak CAA enforcement, mis-issued cert). Belt and suspenders.',
		tradeoffs: 'Stateless 48h-lookback / 24h-schedule = max two alerts per cert. Allow-list is just substring matching on issuer name — narrow-scope by design.',
		code: ['infra/ct_monitor.tf', 'infra/ct_monitor.py'],
		prs: [198],
	},

	// ─── identity + contact ────────────────────────────────────────────
	{
		id: 'security-txt',
		title: 'security.txt (RFC 9116)',
		category: 'identity',
		status: 'shipped',
		what: 'Standardised contact + encryption fields at `/.well-known/security.txt`, signed-into-rebuild monthly so the `Expires` field never goes stale.',
		why: 'A researcher who finds a bug should be able to reach you in seconds, not by guessing emails. The monthly rebuild is the cron that keeps `Expires:` from silently expiring.',
		code: ['src/pages/.well-known/security.txt.ts', '.github/workflows/deploy.yml'],
		verify: { label: '/.well-known/security.txt', href: '/.well-known/security.txt' },
	},
	{
		id: 'pgp-wkd',
		title: 'PGP key + WKD discovery',
		category: 'identity',
		status: 'shipped',
		what: 'Armored PGP key at `/pgp.asc` and the WKD binary at `/.well-known/openpgpkey/hu/<zbase32>` so `gpg --locate-keys mills@millsymills.com` finds the right key without ever asking a key server.',
		why: 'Encrypted contact requires a discoverable key. WKD is the auto-discovery layer — keyservers are not. Both forms ship; consumers pick what their tooling supports.',
		tradeoffs: 'Drift between the armored key, the WKD binary, and the fingerprint declared in `src/data/pgp.ts` is caught by `scripts/assert-pgp-consistency.sh` in CI.',
		code: ['src/data/pgp.ts', 'scripts/generate-wkd.sh', 'scripts/assert-pgp-consistency.sh'],
	},
	{
		id: 'signed-commits',
		title: 'Signed commits on main',
		category: 'identity',
		status: 'shipped',
		what: 'Branch protection on `main` requires a verified signature on every commit (`required_signatures.enabled = true`, `enforce_admins = true`); GitHub rejects an unsigned push with `GH006: Protected branch update failed -- Commits must have verified signatures`. The rule is enforced server-side via the GitHub UI; the parked `github_branch_protection_v3` resource (`infra/github_branch_protection.tf.disabled`) holds the Terraform codification of the same rule, ready to enable once a fine-grained PAT with `Administration: Read` is wired up so `terraform plan` can surface UI toggle-off as drift. `CONTRIBUTING.md` documents the SSH signing setup contributors run once: reuse the GitHub auth key, `git config gpg.format ssh`, register a Signing Key in GitHub Settings, verify with `git log --show-signature`.',
		why: 'Branch protection bypassed via stolen credentials becomes visibly broken: pushes without a signature get rejected at the remote, and squash-merges through the GitHub UI use GitHub\'s own signing key. Provenance of every new change on `main` has a rooted chain to the signer\'s identity.',
		tradeoffs: 'Existing pre-rule history on `main` stays unsigned -- no force-push backfill. Direct CLI pushes to `main` (rare; PR squash-merge is the merge path) require the contributor\'s host to have signing wired up; squash-merges from the GitHub UI are auto-signed by GitHub regardless. Drift detection currently relies on the build-time signed-commits check in `deploy.yml`, which is non-blocking until the PAT lands (tracked in #478).',
		code: ['CONTRIBUTING.md', 'infra/github_branch_protection.tf.disabled'],
		prs: [321],
	},
	{
		id: 'mail-pow',
		title: 'Mail address behind proof-of-work',
		category: 'identity',
		status: 'shipped',
		what: 'The mailbox address on `/mail/` is decrypted client-side after a ~16K-iteration sha-256 PoW (~150–800ms in a web worker).',
		why: 'Keeps the address out of static HTML so casual scrapers don\'t get a free mailto. Real humans wait less than a second; bulk scrapers don\'t spend the CPU.',
		tradeoffs: 'Determined scrapers will eat the CPU cost; PoW raises cost, doesn\'t eliminate it. Address is also published in clear in `security.txt` and PGP UID anyway — by design, since researchers should be able to reach you.',
		code: ['src/scripts/mail-pow.ts', 'src/scripts/mail-pow.worker.ts'],
	},

	// ─── privacy ───────────────────────────────────────────────────────
	{
		id: 'no-tracking',
		title: 'Zero analytics, zero third-party fetches',
		category: 'privacy',
		status: 'shipped',
		what: 'No analytics, no cookies, no fingerprinting, no tag managers, no third-party scripts. Self-hosted fonts. Static HTML + CSS + a little JavaScript served from CloudFront.',
		why: 'The privacy page can only make a "we don\'t track you" claim if there\'s nothing to track you with. Removing the surface is the strongest possible posture.',
		code: ['src/data/privacy-copy.ts', 'src/pages/'],
	},
	{
		id: 'privacy-lints',
		title: 'Build-time privacy invariants',
		category: 'privacy',
		status: 'shipped',
		what: 'Two build-time CI lints: (a) every `localStorage`/`sessionStorage` key written by `src/scripts/` must be documented on the privacy page; (b) every `/fonts/<file>` referenced in `src/` must ship at `dist/fonts/<file>` and `dist/` must contain zero `fonts.googleapis.com` / `fonts.gstatic.com` references.',
		why: 'The privacy page is a load-bearing claim of accuracy. A drift bug ("you said local, code uses session") or a stray Google Fonts link would silently make the page wrong. The lints turn the runtime invariant into a CI failure.',
		code: ['scripts/assert-privacy-storage-keys.mjs', 'scripts/assert-fonts-csp.sh'],
		prs: [203, 204],
	},
	{
		id: 'cf-access-logs',
		title: 'CloudFront access logs (90-day TTL, no processing)',
		category: 'privacy',
		status: 'shipped',
		what: 'Standard CloudFront access logs (URL, IP, user-agent, timestamp, status code) land in a private S3 bucket and auto-expire after 90 days. No further processing, no profile-building.',
		why: 'Logs exist so outages are debuggable; nothing more. The lifecycle policy means there\'s no archive to subpoena, leak, or accidentally retain.',
		code: ['infra/cloudfront_logging.tf', 'infra/s3.tf'],
	},
	{
		id: 'logs-versioning',
		title: 'Versioned access-log bucket (forensic integrity)',
		category: 'monitoring',
		status: 'shipped',
		what: 'The access-log bucket has versioning on, plus a noncurrent-version expiration matching the 90-day current-version retention. A second lifecycle rule sweeps the orphan delete markers that versioning leaves behind.',
		why: 'A compromised or overbroad IAM principal cannot silently destroy forensic evidence — overwrites preserve prior versions; deletes insert a delete marker rather than erasing bytes. Recoverable for the same 90-day window the current-version expiration already guarantees.',
		tradeoffs: 'Object Lock would be stronger but is only settable at bucket creation time; deferred until the bucket is replaced for another reason. No principal in `infra/github_oidc.tf` holds `s3:DeleteObjectVersion` on the logs bucket today, so the standard-compromise path is closed.',
		code: ['infra/s3.tf'],
	},

	// ─── roadmap ───────────────────────────────────────────────────────
	{
		id: 'bimi',
		title: 'BIMI (logo on authenticated mail)',
		category: 'email',
		status: 'shipped',
		what: 'Tiny-PS SVG logo at `/bimi/logo.svg` + `default._bimi.millsymills.com` TXT record advertising it.',
		why: 'Surfaces the brand logo in supporting clients (Fastmail, Proton, some Apple Mail) for mail that already passed DMARC alignment. DMARC at `p=reject` clears the strong-policy precondition.',
		tradeoffs: 'No Verified Mark Certificate (VMC) — Gmail and Yahoo will not render the logo without one (~$1.5K/yr issuance cost). Proton and Fastmail render BIMI without a VMC, so the record still earns its keep on supporting clients. Mail flows on `millsymills.com` as of the 2026-05-14 activation, so BIMI takes effect on the first DMARC-pass message to a supporting client.',
		code: ['public/bimi/logo.svg', 'infra/email.tf'],
	},
	{
		id: 'csp-nonces',
		title: 'Strict CSP with per-request nonces',
		category: 'web',
		status: 'roadmap',
		what: 'CloudFront Function injects a per-request nonce, replacing the `\'unsafe-inline\'` concession in `style-src` (and any inline scripts) with `\'nonce-XXX\'`.',
		why: 'Closes the remaining XSS-via-injected-style vector and removes the only weak link in the current CSP allow-list.',
	},
	{
		id: 'trusted-types',
		title: 'Trusted Types (report-only)',
		category: 'web',
		status: 'shipped',
		what: 'Parallel `Content-Security-Policy-Report-Only: require-trusted-types-for \'script\'; trusted-types default` header. Reports DOM-XSS sink usage (`innerHTML`, `Element.outerHTML`, etc.) to `/api/csp-report` without blocking it.',
		why: 'Trusted Types kill DOM-XSS sinks at the source; promoted from report-only to enforcing once the report stream stays clean for 1-2 weeks.',
		tradeoffs: 'Currently report-only — violations are logged but allowed. Enforcing requires no violations from any DOM-sink hot path in the site\'s emitted bundles. The codebase uses `textContent` rather than `innerHTML` throughout, so the report stream should stay empty in steady-state.',
		code: ['infra/cloudfront.tf'],
	},
	{
		id: 'hsts-preload',
		title: 'HSTS preload-list submission',
		category: 'web',
		status: 'shipped',
		what: 'Submitted `millsymills.com` to https://hstspreload.org/ on 2026-05-21 with `includeSubDomains`. The submission was accepted ("pending inclusion") immediately after the eligibility check (`Status: not preloaded; Eligibility: eligible`) confirmed the live header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` met all requirements.',
		why: 'Closes the first-visit TLS-stripping window for browsers that haven\'t yet seen the HSTS header.',
		tradeoffs: 'Chrome propagates the preload list to stable channel via the browser release train — entries typically appear in `chrome://net-internals/#hsts` weeks-to-months after acceptance. Firefox/Safari pull from Chrome\'s list, so they trail. Removal is asymmetric: publish `max-age=0` first, verify live, then file at https://hstspreload.org/removal/ — Chrome propagates removals over ~12 weeks via the same release train. Don\'t flip the header value back without going through the removal process first.',
		code: ['infra/cloudfront.tf'],
	},
];
