#!/usr/bin/env node
//
// Assert dist/<id>/index.html's og:image meta tracks src/data/apps.ts's
// `hidden` flag for every app:
//
//   - hidden:true  → no `og:image*` meta of any kind
//   - hidden:false → exactly the expected `<meta property="og:image"
//                    content=".../og/<id>.png">` line
//
// What this catches:
//   - Drift between the og:image emitter (src/pages/[app].astro) and the
//     OG PNG endpoint (src/pages/og/[app].png.ts), which both filter on
//     `app.hidden` independently. If one decides hidden routes get
//     og:image and the other does not, link unfurlers fetch a 404 PNG —
//     the bug fixed in #278.
//   - A future refactor that splits `DesktopLayout.astro`'s four
//     `{ogImage && ...}` gates and forgets the conditional on one of them.
//   - A new app added without setting `hidden:true` that should have
//     been off-discovery (mirror gate to assert-llms-txt-completeness.sh).
//
// What it does NOT catch:
//   - Whether the OG PNG endpoint actually rendered the file. That's
//     covered by Astro's getStaticPaths failing the build if the
//     endpoint and the route diverge — the gate that exists today is
//     "if og:image is in the HTML, the PNG file better be in dist/og/".
//     This script asserts the inverse: hidden routes don't reference
//     PNGs that were never built.
//
// Run after `npm run build` so dist/ exists. Wired into ci-local.sh.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const DIST = join(ROOT, 'dist');
const APPS_TS = join(ROOT, 'src/data/apps.ts');

const RED = '\x1b[1;31m';
const GREEN = '\x1b[1;32m';
const RESET = '\x1b[0m';

function fail(msg) {
	process.stderr.write(`${RED}✗ ${msg}${RESET}\n`);
}
function ok(msg) {
	process.stdout.write(`${GREEN}✓ ${msg}${RESET}\n`);
}

// Parse apps.ts for `id: '<id>'` and `hidden: true` adjacency. Each
// app object literal in `_APPS_DATA` has `id` near the top of the
// block and an optional `hidden` field; we walk top-level objects,
// extract their id, and check whether they declared hidden:true.
// A real TS parser would be sturdier — but the apps.ts shape has been
// stable for >270 PRs, so a regex pass over the source is enough and
// keeps this lint runnable without adding a TS toolchain dep.
function parseApps() {
	const src = readFileSync(APPS_TS, 'utf8');
	const start = src.indexOf('_APPS_DATA = [');
	if (start === -1) throw new Error('apps.ts: _APPS_DATA literal not found');
	const end = src.indexOf('] as const', start);
	if (end === -1) throw new Error('apps.ts: end of _APPS_DATA literal not found');
	const body = src.slice(start, end);

	// Split on top-level `{` boundaries. Object literals in apps.ts are
	// not nested past one level for the fields we care about (id, hidden).
	const apps = [];
	const objectRe = /\{([^{}]|\{[^{}]*\})*\}/g;
	for (const match of body.matchAll(objectRe)) {
		const block = match[0];
		const idMatch = block.match(/\bid:\s*'([^']+)'/);
		if (!idMatch) continue;
		const id = idMatch[1];
		const hidden = /\bhidden:\s*true\b/.test(block);
		apps.push({ id, hidden });
	}
	if (apps.length === 0) throw new Error('apps.ts: no app entries parsed');
	return apps;
}

function checkApp({ id, hidden }) {
	const path = join(DIST, id, 'index.html');
	let html;
	try {
		html = readFileSync(path, 'utf8');
	} catch {
		return [`dist/${id}/index.html missing — did the build fail or skip this route?`];
	}

	const ogImageRe = /<meta\s+property="og:image[^"]*"[^>]*>/gi;
	const matches = html.match(ogImageRe) ?? [];

	const violations = [];
	if (hidden) {
		if (matches.length > 0) {
			violations.push(
				`dist/${id}/index.html: hidden app emits ${matches.length} og:image* meta tag(s) — should emit zero`,
			);
		}
	} else {
		const expected = `/og/${id}.png`;
		const hasExpected = matches.some(
			(m) =>
				m.includes('property="og:image"') &&
				!m.includes('og:image:') &&
				m.includes(expected),
		);
		if (!hasExpected) {
			violations.push(
				`dist/${id}/index.html: visible app missing <meta property="og:image" content="...${expected}">`,
			);
		}
	}
	return violations;
}

function main() {
	const apps = parseApps();
	const violations = [];
	for (const app of apps) {
		violations.push(...checkApp(app));
	}

	if (violations.length > 0) {
		for (const v of violations) fail(v);
		fail(
			`${violations.length} og:image drift(s) between apps.ts hidden flag and dist/. Either set hidden in apps.ts or fix [app].astro / DesktopLayout.astro.`,
		);
		process.exit(1);
	}

	const visible = apps.filter((a) => !a.hidden).length;
	const hidden = apps.length - visible;
	ok(`og:image gate: ${visible} visible app(s) emit og:image; ${hidden} hidden app(s) emit none`);
}

main();
