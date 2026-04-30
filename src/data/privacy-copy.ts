/*
 * Privacy-page copy. Broken into named sections so Privacy.astro
 * can lay out without inlining paragraphs.
 *
 * Voice: lowercase, terse, Y2K-pink. Keep claims accurate — the page
 * itself is the credibility; shipping untrue statements here is worse
 * than shipping no page at all.
 */

export interface BrowserStorageKey {
	key: string;
	/** which web-storage API holds it */
	storage: 'local' | 'session';
	purpose: string;
}

export const browserStorageKeys: BrowserStorageKey[] = [
	{ key: 'mills.desktop.v1', storage: 'local', purpose: 'open windows, positions, last-open app' },
	{ key: 'mills.flags.v1', storage: 'local', purpose: 'captured CTF flags' },
	{ key: 'mills.vscode.v1', storage: 'local', purpose: 'vscode.exe open tabs + active tab' },
	{ key: 'mills.wallpaper.v1', storage: 'local', purpose: 'selected desktop wallpaper id' },
	{ key: 'mills.boot.played', storage: 'session', purpose: '"played boot sequence already" flag' },
	{ key: 'mills.clippy.dismissed', storage: 'local', purpose: 'clippy dismissed permanently ("don\'t come back")' },
	{ key: 'mills.clippy.dismissed', storage: 'session', purpose: 'clippy dismissed for this tab only' },
];

export const copy = {
	intro: 'this site does not track you. the rest of this page is a more specific statement of that fact, so you can check the receipts.',
	whatWeCollect: {
		heading: 'what we collect',
		body: 'nothing. no analytics, no cookies, no fingerprinting, no tag managers, no third-party scripts. the site is static html + css + a little javascript, served from cloudfront, built from a public github repo.',
	},
	whatsOnTheWire: {
		heading: "what's on the wire",
		body: 'when you load a page: html, css, images, the two self-hosted fonts (Press Start 2P, VT323), and the javascript bundle for the desktop ui. that\'s it. zero third-party fetches. no google fonts, no cdn libraries, no analytics beacons.',
	},
	mailPow: {
		heading: 'the mail address',
		body: '/mail/ runs a small client-side proof-of-work to decrypt mills\' email address — keeps it out of the static html so casual scrapers don\'t get a free mailto. nothing leaves your browser; it\'s ~16K sha-256 hashes in a web worker (~150-800ms) and the result is never stored or transmitted.',
	},
	localStorage: {
		heading: 'browser storage',
		preamble: 'a handful of keys keep your ui state between visits. everything is client-side, never sent anywhere. two storage types — `localStorage` persists across browser restarts, `sessionStorage` clears when you close the tab:',
	},
	serverLogs: {
		heading: 'server logs',
		body: 'cloudfront keeps standard access logs (url, ip, user-agent, timestamp, status code) in an s3 bucket we own. they auto-expire after 90 days. no additional logging, no processing, no profile-building. the logs exist so outages are debuggable.',
	},
	botsAndAi: {
		heading: 'bots / AI',
		body: 'the site publishes `/robots.txt`, and that file carries a `Content-Signal:` header (the cloudflare content-signals extension) stating our stance on crawlers and ai training. respect it or don\'t — we\'re not going to litigate either way.',
	},
	licenseAndSource: {
		heading: 'license + source',
		body: 'the site\'s source is MIT-licensed on github. if any of this reads sketchy, read the source. fork it, run your own.',
		repoUrl: 'https://github.com/millsmillsymills/millsymills.com',
	},
	attestationPrefix: 'served from commit',
};
