/*
 * Privacy-page copy. Broken into named sections so Privacy.astro
 * can lay out without inlining paragraphs.
 *
 * Voice: lowercase, terse, Y2K-pink. Keep claims accurate — the page
 * itself is the credibility; shipping untrue statements here is worse
 * than shipping no page at all. Every load-bearing claim cites a path
 * in the repo (or a deployed config file) so a reader can verify by
 * clicking through to the implementation.
 */

import { REPO_URL } from './security-controls';

export interface BrowserStorageKey {
	key: string;
	/** which web-storage API holds it */
	storage: 'local' | 'session';
	purpose: string;
}

export interface Citation {
	label: string;
	/** repo-relative path; rendered as a github blob link */
	path: string;
}

export const browserStorageKeys: BrowserStorageKey[] = [
	{ key: 'mills.desktop.v1', storage: 'local', purpose: 'open windows, positions, last-open app' },
	{ key: 'mills.flags.v1', storage: 'local', purpose: 'captured CTF flags' },
	{ key: 'mills.vscode.v1', storage: 'local', purpose: 'vscode.exe open tabs + active tab' },
	{ key: 'mills.wallpaper.v1', storage: 'local', purpose: 'selected desktop wallpaper id' },
	{ key: 'mills.theme.v1', storage: 'local', purpose: 'selected desktop theme id' },
	{ key: 'mills.boot.played', storage: 'session', purpose: '"played boot sequence already" flag' },
	{ key: 'mills.clippy.dismissed', storage: 'local', purpose: 'clippy dismissed permanently ("don\'t come back")' },
	{ key: 'mills.clippy.dismissed', storage: 'session', purpose: 'clippy dismissed for this tab only' },
	{ key: 'mills.passkey-demo.v1', storage: 'local', purpose: '/demo/passkey credential id + display name (sandbox)' },
	{ key: 'mills.sounds.enabled', storage: 'local', purpose: 'XP system-sounds opt-in toggle (default off)' },
];

export const copy = {
	intro:
		'this site does not track you. the rest of this page is a more specific statement of that fact, with citations into the repo so you can check the receipts.',
	whatWeCollect: {
		heading: 'what we collect',
		body: 'nothing. no analytics, no cookies, no fingerprinting, no tag managers, no third-party scripts. the site is static html + css + a little javascript, served from cloudfront, built from a public github repo. the cloudfront cache policy explicitly forwards zero cookies to the origin.',
		citations: [
			{ label: 'infra/cloudfront.tf (cookie_behavior = "none")', path: 'infra/cloudfront.tf' },
			{ label: 'infra/cloudfront.tf (CSP: default-src \'self\')', path: 'infra/cloudfront.tf' },
		] as Citation[],
	},
	whatsOnTheWire: {
		heading: "what's on the wire",
		body: 'when you load a page: html, css, images, four self-hosted webfonts (Tahoma, Franklin Gothic ITC, Press Start 2P, VT323), and the javascript bundle for the desktop ui. that\'s it. zero third-party fetches. no google fonts, no cdn libraries, no analytics beacons. the content security policy pins `default-src`, `script-src`, `connect-src`, `img-src`, and `font-src` to `\'self\'`, so the browser refuses any cross-origin fetch even if one slipped past code review.',
		citations: [
			{ label: 'src/styles/desktop.css (font @font-face declarations)', path: 'src/styles/desktop.css' },
			{ label: 'infra/cloudfront.tf (CSP response-headers policy)', path: 'infra/cloudfront.tf' },
			{ label: 'scripts/assert-fonts-csp.sh (CI lint: no Google Fonts in dist/)', path: 'scripts/assert-fonts-csp.sh' },
		] as Citation[],
	},
	mailPow: {
		heading: 'the mail address',
		body: '/mail/ runs a small client-side proof-of-work to decrypt mills\' email address — keeps it out of the static html so casual scrapers don\'t get a free mailto. nothing leaves your browser; it\'s ~16K sha-256 hashes in a web worker (difficulty 14 bits, ~150-800ms on a modern laptop) and the decrypted result is never stored or transmitted.',
		citations: [
			{ label: 'src/scripts/mail-pow.ts (decrypt + reveal)', path: 'src/scripts/mail-pow.ts' },
			{ label: 'src/scripts/mail-pow.worker.ts (sha-256 search)', path: 'src/scripts/mail-pow.worker.ts' },
			{ label: 'astro.config.mjs (build-time manifest, 14 bits)', path: 'astro.config.mjs' },
		] as Citation[],
	},
	localStorage: {
		heading: 'browser storage',
		preamble:
			'a handful of keys keep your ui state between visits. everything is client-side, never sent anywhere. two storage types — `localStorage` persists across browser restarts, `sessionStorage` clears when you close the tab. a build-time lint fails CI if this list drifts from the keys the scripts actually write:',
		citations: [
			{ label: 'scripts/assert-privacy-storage-keys.mjs (CI lint)', path: 'scripts/assert-privacy-storage-keys.mjs' },
		] as Citation[],
	},
	serverLogs: {
		heading: 'server logs',
		body: 'cloudfront keeps standard access logs (url, ip, user-agent, timestamp, status code) in a private s3 bucket we own. they auto-expire after 90 days as the current version, plus up to another 90 days as a noncurrent (recoverable) version, then they are gone. no further processing, no profile-building. the logs exist so outages are debuggable. the only other server-side data is browser-generated csp violation reports posted to `/api/csp-report` and kept for 30 days — those are debugging telemetry from the browser, not user content.',
		citations: [
			{ label: 'infra/s3.tf (90-day current + 90-day noncurrent expiration)', path: 'infra/s3.tf' },
			{ label: 'infra/cloudfront_logging.tf (standard logs v2 → S3)', path: 'infra/cloudfront_logging.tf' },
			{ label: 'infra/csp_report.tf (30-day report retention)', path: 'infra/csp_report.tf' },
		] as Citation[],
	},
	botsAndAi: {
		heading: 'bots / AI',
		body: 'the site publishes `/robots.txt`, including the cloudflare `Content-Signal:` extension. the current signal is `search=yes, ai-input=yes, ai-train=yes` — indexing, summarising, and training on this site\'s content are all explicitly welcome. `/llms.txt` and `/llms-full.txt` are published as a fast path for agents.',
		citations: [
			{ label: 'src/pages/robots.txt.ts', path: 'src/pages/robots.txt.ts' },
			{ label: 'src/pages/llms.txt.ts', path: 'src/pages/llms.txt.ts' },
			{ label: 'src/pages/llms-full.txt.ts', path: 'src/pages/llms-full.txt.ts' },
		] as Citation[],
	},
	licenseAndSource: {
		heading: 'license + source',
		body: 'the site\'s source is MIT-licensed on github. if any of this reads sketchy, read the source. fork it, run your own.',
		repoUrl: REPO_URL,
	},
	attestationPrefix: 'served from commit',
};
