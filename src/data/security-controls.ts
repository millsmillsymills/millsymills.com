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
		tradeoffs: '`style-src \'self\' \'unsafe-inline\'` is the one knowing concession to make Astro\'s scoped styles work; tightening to nonces is tracked as #129.',
		code: ['infra/cloudfront.tf'],
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
		id: 'coop-coep',
		title: 'Cross-origin isolation (COOP / COEP / CORP)',
		category: 'web',
		status: 'shipped',
		what: '`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin` on every response.',
		why: 'Closes Spectre-class side channels and cross-origin window-reference leaks. The combination puts the document in a cross-origin isolated agent cluster, also unlocking precision-timer + SharedArrayBuffer features if we ever need them.',
		tradeoffs: 'COEP `require-corp` is the strict variant — every cross-origin subresource has to opt in via CORP/CORS. Site is fully self-hosted (no third-party scripts, fonts, images, or iframes; `assert-fonts-csp.sh` keeps it that way), so the strict variant ships without breaking anything. Same-origin CORP also blocks third-party hot-linking of static assets.',
		code: ['infra/cloudfront.tf', 'scripts/assert-coop-coep-corp.sh'],
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
		title: 'Null MX (RFC 7505) before Proton activation',
		category: 'email',
		status: 'shipped',
		what: 'Until ProtonMail is configured, `MX 0 .` is published — the explicit "this domain accepts no mail" record.',
		why: 'Hard-bounces any spoofing attempt at the SMTP layer instead of silently dropping. The DNS posture is unspoofable from day one, regardless of Proton timeline.',
		code: ['infra/email.tf'],
	},
	{
		id: 'spf',
		title: 'SPF',
		category: 'email',
		status: 'shipped',
		what: '`v=spf1 -all` when Proton is off; `v=spf1 include:_spf.protonmail.ch -all` once activated.',
		why: 'Tells receivers exactly which SMTP origins are allowed to send mail as this domain. The `-all` (hard-fail) is intentional — soft-fail is a polite request, hard-fail is a refusal.',
		code: ['infra/email.tf'],
	},
	{
		id: 'dmarc',
		title: 'DMARC at p=reject (strict)',
		category: 'email',
		status: 'shipped',
		what: '`v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@<domain>; fo=1; adkim=s; aspf=s` from day one.',
		why: 'Strict alignment + reject means any mail that fails SPF or DKIM (or doesn\'t have aligned identifiers) gets dropped, not quarantined. Proton is the only legitimate sender, so aligned DKIM/SPF should pass on day one — no `p=quarantine` training phase needed.',
		tradeoffs: 'Aggregate reports land at `dmarc@<domain>` — useless until that mailbox actually exists in Proton.',
		code: ['infra/email.tf'],
	},
	{
		id: 'tls-rpt',
		title: 'TLS-RPT (RFC 8460)',
		category: 'email',
		status: 'shipped',
		what: '`_smtp._tls.<domain> TXT "v=TLSRPTv1; rua=mailto:tls-rpt@<domain>"` advertises the daily-aggregate TLS-failure report endpoint.',
		why: 'Sending MTAs publish reports about TLS negotiation failures to inbound mail. Surfaces silent delivery issues; becomes the telemetry layer once MTA-STS rolls out.',
		tradeoffs: 'Useless until Proton is live — null MX means no remote MTA attempts delivery, so no reports get generated.',
		code: ['infra/email.tf'],
		prs: [202],
	},

	// ─── supply chain ──────────────────────────────────────────────────
	{
		id: 'oidc-deploy',
		title: 'OIDC-only deploy (no long-lived AWS keys)',
		category: 'supply-chain',
		status: 'shipped',
		what: 'GitHub Actions assumes a per-stack IAM role via `AssumeRoleWithWebIdentity`. The trust policy pins `repo:owner/name`, branch (`main`), and the specific workflow file (`deploy.yml` / `deploy-rehearsal.yml`) via `job_workflow_ref`.',
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

	// ─── roadmap ───────────────────────────────────────────────────────
	{
		id: 'mta-sts',
		title: 'MTA-STS',
		category: 'email',
		status: 'roadmap',
		what: 'Static `mta-sts.<domain>/.well-known/mta-sts.txt` policy + `_mta-sts` TXT record telling sending MTAs to enforce TLS to inbound mail.',
		why: 'Upgrades opportunistic SMTP TLS to enforced — blocks passive downgrade attacks visible to peer MTAs.',
		tradeoffs: 'Gated on Proton activation. Will deploy in `mode: testing` first so TLS-RPT can surface failures before flipping to `enforce`.',
	},
	{
		id: 'dane',
		title: 'DANE TLSA for SMTP',
		category: 'email',
		status: 'roadmap',
		what: 'TLSA records pinning Proton\'s TLS cert chain, validated via DNSSEC.',
		why: 'Belt + suspenders alongside MTA-STS. Receivers that support DANE refuse to deliver if Proton\'s cert doesn\'t match the pin.',
		tradeoffs: 'Requires DNSSEC live (✓), Proton active (✗), and Proton cert rotation visibility.',
	},
	{
		id: 'bimi',
		title: 'BIMI (logo on authenticated mail)',
		category: 'email',
		status: 'roadmap',
		what: 'Tiny-PS SVG logo at `/bimi/logo.svg` + `default._bimi` TXT record.',
		why: 'Surfaces the brand logo in supporting clients (Fastmail, Proton, some Apple Mail) for mail that already passed DMARC.',
		tradeoffs: 'No VMC (Verified Mark Certificate) — Gmail won\'t render the logo without one. Proton/Fastmail will.',
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
		id: 'signed-commits',
		title: 'Required signed commits on main',
		category: 'supply-chain',
		status: 'roadmap',
		what: 'Branch protection rule requiring signed commits on `main`; CONTRIBUTING.md documents SSH commit-signing setup.',
		why: 'Rooted provenance — every commit on the protected branch carries a verified signing identity, so a stolen GitHub credential can\'t silently inject code.',
	},
	{
		id: 'hsts-preload',
		title: 'HSTS preload-list submission',
		category: 'web',
		status: 'roadmap',
		what: 'Submit `millsymills.com` to https://hstspreload.org/ for inclusion in the browser-shipped preload list.',
		why: 'Closes the first-visit TLS-stripping window for browsers that haven\'t yet seen the HSTS header.',
		tradeoffs: 'Submission is a manual one-time step. The header is already shipping with `preload`, so the eligibility check passes.',
		code: ['infra/cloudfront.tf'],
	},
];
