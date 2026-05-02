#!/usr/bin/env node
//
// Assert every cross-origin asset-loading tag in dist/ carries `integrity`
// + `crossorigin`. The site is fully self-hosted today (only same-origin
// canonical hrefs survive `npm run build`), so the practical purpose of
// this lint is forward-pressure: a future dependency that adds a CDN
// `<script src>` or stylesheet `<link href>` trips the build instead of
// silently shipping an unverified asset.
//
// What "cross-origin" means here:
//   - any URL with an explicit scheme (https:, http:, //) whose host is
//     NOT in the allowlist of known site origins (millsymills.com,
//     www.millsymills.com, p41m0n.com, www.p41m0n.com).
//   - bare-relative URLs (`/foo.js`, `foo.js`) are same-origin by definition.
//   - data: URIs are local content — exempt.
//
// What gets checked:
//   - <script src="...">                 — needs integrity + crossorigin
//   - <link rel="stylesheet" href="...">  — needs integrity + crossorigin
//   - <link rel="preload" as="(script|style)" href="..."> — same
//   - <link rel="modulepreload" href="..."> — same
//
// What's exempt:
//   - <link rel="canonical|alternate|icon|sitemap|preconnect|dns-prefetch">
//     (informational or hint-only — no asset is fetched-and-executed)
//   - <link rel="preload" as="(font|image|fetch|...)"> — non-execution
//
// Why this matters even with no cross-origin assets today:
//   The /security page lists "no third-party JS or CSS" as a posture
//   claim. A future regression (CDN polyfill, analytics SDK, etc.) would
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
	'p41m0n.com',
	'www.p41m0n.com',
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

function listHtmlFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...listHtmlFiles(p));
		else if (p.endsWith('.html')) out.push(p);
	}
	return out;
}

function isCrossOrigin(url) {
	if (url.startsWith('data:')) return false;
	let host;
	if (url.startsWith('//')) host = url.slice(2).split('/')[0];
	else if (/^https?:\/\//.test(url)) host = new URL(url).host;
	else return false; // relative path → same-origin
	return !ALLOWED_ORIGINS.has(host.toLowerCase());
}

// Tag-attribute parser sized for Astro's emitted HTML — single-line
// tags with `attr="value"` quoting. Astro 6 normalizes attribute
// quoting so this regex matches every script/link the build emits.
// If a future generator emits unquoted attributes, this lint will
// false-negative; the failure mode is "lint silently passes a bad
// asset", which would be caught by the next dependency that adds a
// real CDN URL anyway.
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

function checkFile(path) {
	const html = readFileSync(path, 'utf8');
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

	const files = listHtmlFiles(DIST);
	if (files.length === 0) {
		fail('no HTML files in dist/ — refusing to assert blind');
		process.exit(1);
	}

	let total = 0;
	for (const f of files) {
		const v = checkFile(f);
		for (const msg of v) {
			fail(`${f.replace(`${ROOT}/`, '')}: ${msg}`);
			total++;
		}
	}

	if (total > 0) {
		fail(
			`${total} cross-origin asset(s) without SRI. Add integrity="sha384-..." + crossorigin="anonymous", or self-host.`,
		);
		process.exit(1);
	}

	ok(`SRI gate: ${files.length} HTML file(s) scanned, no cross-origin assets without integrity`);
}

main();
