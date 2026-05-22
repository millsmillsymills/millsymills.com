#!/usr/bin/env node
// Postbuild step: compute SHA-256 hashes of every JS bundle in dist/_astro/,
// inject a Content-Security-Policy `<meta>` tag into each HTML's <head> that
// pins `script-src` to those hashes plus `'strict-dynamic'`.
//
// Why a meta tag and not the header CSP from CloudFront:
//   - The header CSP is provisioned by terraform and rotated at apply time,
//     not at deploy time. Per-deploy hash rotation requires a value that
//     ships with the bundles themselves.
//   - The hash set changes every time a bundle hash in dist/_astro/ changes
//     (i.e. every time an Astro island's source changes). A static-value
//     header would lag behind reality.
//   - The header CSP stays as the broad enforcing fallback (script-src
//     'self'); the meta CSP layers tighter `'sha256-…'` constraints on top.
//     Browsers apply the intersection — meta wins as the more restrictive
//     directive for script-src.
//
// Why `'strict-dynamic'`:
//   - With strict-dynamic, any script allowed by hash can transitively
//     dynamically-import further /_astro/ chunks without each of those
//     chunks needing to be hashed in the meta. Reduces the directive's
//     size to the count of entry points (scripts referenced directly
//     from HTML), not the count of all bundles.
//   - On a static site whose every script is a known build artifact,
//     this is the closest practical analogue to per-request nonces
//     (issue #129's original framing).
//
// Reports go to /api/csp-report (existing endpoint) via both `report-uri`
// (legacy) and `report-to csp` (Reporting API) directives. Matches the
// header CSP's reporting setup so violations from either policy land in
// the same place.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = 'dist';
const ASTRO_DIR = join(DIST_DIR, '_astro');

function listJsBundles() {
	return readdirSync(ASTRO_DIR)
		.filter((name) => name.endsWith('.js'))
		.map((name) => join(ASTRO_DIR, name));
}

function sha256Base64(filePath) {
	const bytes = readFileSync(filePath);
	return createHash('sha256').update(bytes).digest('base64');
}

function walkHtml(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walkHtml(p, out);
		else if (entry.name.endsWith('.html')) out.push(p);
	}
	return out;
}

function main() {
	statSync(DIST_DIR); // throws if missing — fail loud rather than silently skipping
	statSync(ASTRO_DIR);

	const bundles = listJsBundles();
	if (bundles.length === 0) {
		console.error('[inject-csp-hashes] no JS bundles found under dist/_astro/ — refusing to inject an empty hash set');
		process.exit(2);
	}

	const sources = bundles.map((p) => `'sha256-${sha256Base64(p)}'`);

	// CSP value. `script-src` carries the hash set + `strict-dynamic`;
	// `base-uri` and `object-src` mirror the header CSP for defense in depth.
	// Reporting directives use the same /api/csp-report sink as the header.
	const cspValue = [
		`script-src ${sources.join(' ')} 'strict-dynamic'`,
		"object-src 'none'",
		"base-uri 'none'",
		'report-uri /api/csp-report',
		'report-to csp',
	].join('; ');

	const metaTag = `<meta http-equiv="Content-Security-Policy" content="${cspValue}">`;

	const htmlFiles = walkHtml(DIST_DIR);
	let injected = 0;
	for (const file of htmlFiles) {
		const html = readFileSync(file, 'utf8');
		if (!html.includes('<head>')) continue;
		const next = html.replace('<head>', `<head>${metaTag}`);
		writeFileSync(file, next);
		injected += 1;
	}

	console.log(`[inject-csp-hashes] ${sources.length} bundle hashes -> ${injected}/${htmlFiles.length} HTML files`);
}

main();
