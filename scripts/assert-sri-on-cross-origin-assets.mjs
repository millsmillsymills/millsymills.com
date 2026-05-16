#!/usr/bin/env node
//
// Assert every cross-origin asset reference in dist/ either carries
// `integrity` + `crossorigin` (for <script src> and stylesheet/preload
// <link>) or doesn't exist at all (for importmap entries and CSS @import,
// which have no place to put an integrity attribute). The site is fully
// self-hosted today, so the practical purpose of this lint is forward-
// pressure: a future dependency that adds a CDN reference trips the
// build instead of silently shipping an unverified asset.
//
// What "cross-origin" means here:
//   - any URL with an explicit scheme (https:, http:, //) whose host is
//     NOT in the allowlist of known site origins (millsymills.com,
//     www.millsymills.com).
//   - bare-relative URLs (`/foo.js`, `foo.js`, `./foo.js`) are same-origin.
//   - data:, blob:, filesystem: URIs are local content — exempt.
//
// What gets checked:
//   - <script src="...">                     — needs integrity + crossorigin
//   - <link rel="stylesheet" href="...">      — needs integrity + crossorigin
//   - <link rel="preload" as="(script|style)" href="..."> — same
//   - <link rel="modulepreload" href="...">   — same
//   - <script type="importmap"> JSON         — every URL in `imports` /
//     `scopes` must be same-origin (importmaps have no integrity surface)
//   - dist/**/*.css `@import url(...)` and `@import "..."` — must be
//     same-origin (CSS @import has no integrity surface)
//
// What's exempt:
//   - <link rel="canonical|alternate|icon|sitemap|preconnect|dns-prefetch">
//     (informational or hint-only — no asset is fetched-and-executed)
//   - <link rel="preload" as="(font|image|fetch|...)"> — non-execution
//   - HTML comments — stripped before scan so a literal <!-- <script
//     src="https://..."> --> doesn't trip the lint.
//
// Why this matters even with no cross-origin assets today:
//   The /security page lists "no third-party JS or CSS" as a posture
//   claim. A future regression (CDN polyfill, analytics SDK, third-party
//   webfont via @import, importmap pointing at esm.sh, etc.) would
//   silently undermine it. CI catches the drift at the same point the
//   posture page would otherwise become subtly wrong.
//
// Run after `npm run build` so dist/ exists. Wired into ci-local.sh +
// ci.yml.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const DIST = join(ROOT, 'dist');

const ALLOWED_ORIGINS = new Set([
	'millsymills.com',
	'www.millsymills.com',
]);

const RED = '\x1b[1;31m';
const GREEN = '\x1b[1;32m';
const RESET = '\x1b[0m';

function fail(msg) {
	process.stderr.write(`${RED}✗ ${msg}${RESET}\n`);
}
function ok(msg) {
	process.stdout.write(`${GREEN}✓ ${msg}${RESET}\n`);
}

function listFiles(dir, ext) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...listFiles(p, ext));
		else if (p.endsWith(ext)) out.push(p);
	}
	return out;
}

// Returns true for cross-origin URLs (scheme + host not in the allowlist).
// Treats malformed URLs as cross-origin — fail-closed: an unparseable URL
// has no business in dist/, and silently exempting it would be the wrong
// failure direction for a security gate.
function isCrossOrigin(url) {
	if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('filesystem:')) {
		return false;
	}
	let host;
	if (url.startsWith('//')) {
		host = url.slice(2).split('/')[0];
	} else if (/^https?:\/\//i.test(url)) {
		try {
			host = new URL(url).host;
		} catch {
			return true;
		}
	} else {
		return false;
	}
	// `URL.host` includes the port; strip it for the allowlist match so
	// `millsymills.com:8443` doesn't read as a foreign origin.
	const bare = host.toLowerCase().split(':')[0];
	return !ALLOWED_ORIGINS.has(bare);
}

// Strip HTML comments before tag scanning so a literal commented-out
// example like <!-- <script src="https://..."> --> doesn't false-positive.
function stripHtmlComments(html) {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

// Tag-attribute parser sized for Astro's emitted HTML — single-line
// tags with `attr="value"` quoting. Astro 6 normalizes attribute
// quoting to double quotes; if a future generator emits single-quoted
// or unquoted attributes, this lint will false-negative on those tags.
// The next dependency that adds a real CDN URL would still trip the
// other checks (importmap or CSS @import scans), so the residual
// silent-pass surface is bounded.
function attrs(tagSource) {
	const out = {};
	for (const m of tagSource.matchAll(/(\w[\w-]*)\s*=\s*"([^"]*)"/g)) {
		out[m[1].toLowerCase()] = m[2];
	}
	return out;
}

function* findTags(html, tagName) {
	const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
	for (const m of html.matchAll(re)) yield m[0];
}

// Collect all <script type="importmap">…</script> JSON bodies. importmap
// URLs cannot carry SRI hashes (no per-URL attribute surface), so the
// only safe posture for a no-third-party-JS site is "no cross-origin
// importmap entries at all."
function* findImportmaps(html) {
	const re = /<script\b[^>]*\btype\s*=\s*"importmap"[^>]*>([\s\S]*?)<\/script>/gi;
	for (const m of html.matchAll(re)) yield m[1];
}

function checkHtml(path) {
	const raw = readFileSync(path, 'utf8');
	const html = stripHtmlComments(raw);
	const violations = [];

	for (const tag of findTags(html, 'script')) {
		const a = attrs(tag);
		if (!a.src || !isCrossOrigin(a.src)) continue;
		if (!a.integrity || !a.crossorigin) {
			violations.push(`<script src="${a.src}"> missing integrity/crossorigin`);
		}
	}

	for (const tag of findTags(html, 'link')) {
		const a = attrs(tag);
		if (!a.href || !isCrossOrigin(a.href)) continue;
		const rel = (a.rel || '').toLowerCase();
		const needsSri =
			rel === 'stylesheet' ||
			rel === 'modulepreload' ||
			(rel === 'preload' && (a.as === 'script' || a.as === 'style'));
		if (!needsSri) continue;
		if (!a.integrity || !a.crossorigin) {
			violations.push(`<link rel="${rel}" href="${a.href}"> missing integrity/crossorigin`);
		}
	}

	for (const body of findImportmaps(html)) {
		let parsed;
		try {
			parsed = JSON.parse(body);
		} catch {
			violations.push(`<script type="importmap"> body is not valid JSON`);
			continue;
		}
		const urls = [];
		for (const v of Object.values(parsed.imports ?? {})) urls.push(v);
		for (const scope of Object.values(parsed.scopes ?? {})) {
			for (const v of Object.values(scope ?? {})) urls.push(v);
		}
		for (const url of urls) {
			if (typeof url === 'string' && isCrossOrigin(url)) {
				violations.push(`<script type="importmap"> entry "${url}" is cross-origin (importmaps have no SRI surface — self-host or remove)`);
			}
		}
	}

	return violations;
}

// CSS @import smuggles a stylesheet load past the <link> scanner. Match
// both `@import url(...)` and bare-string `@import "..."` forms; the
// CSS spec allows both. Single + double quotes here because CSS doesn't
// share Astro's HTML-attribute normalization.
const CSS_IMPORT_RE =
	/@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]+))\s*\)|"([^"]+)"|'([^']+)')/gi;

function checkCss(path) {
	const css = readFileSync(path, 'utf8');
	const violations = [];
	for (const m of css.matchAll(CSS_IMPORT_RE)) {
		const url = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim();
		if (!url) continue;
		if (isCrossOrigin(url)) {
			violations.push(`@import "${url}" is cross-origin (CSS @import has no SRI surface — self-host or remove)`);
		}
	}
	return violations;
}

function main() {
	let stat;
	try {
		stat = statSync(DIST);
	} catch {
		fail(`dist/ not found at ${DIST} — run \`npm run build\` first`);
		process.exit(1);
	}
	if (!stat.isDirectory()) {
		fail(`dist/ is not a directory`);
		process.exit(1);
	}

	const htmlFiles = listFiles(DIST, '.html');
	const cssFiles = listFiles(DIST, '.css');
	if (htmlFiles.length === 0) {
		fail('no HTML files in dist/ — refusing to assert blind');
		process.exit(1);
	}

	let total = 0;
	for (const f of htmlFiles) {
		for (const msg of checkHtml(f)) {
			fail(`${f.replace(`${ROOT}/`, '')}: ${msg}`);
			total++;
		}
	}
	for (const f of cssFiles) {
		for (const msg of checkCss(f)) {
			fail(`${f.replace(`${ROOT}/`, '')}: ${msg}`);
			total++;
		}
	}

	if (total > 0) {
		fail(
			`${total} cross-origin reference(s) without SRI. Add integrity="sha384-..." + crossorigin="anonymous" where supported, or self-host.`,
		);
		process.exit(1);
	}

	ok(
		`SRI gate: ${htmlFiles.length} HTML + ${cssFiles.length} CSS file(s) scanned, no cross-origin references without integrity`,
	);
}

main();
