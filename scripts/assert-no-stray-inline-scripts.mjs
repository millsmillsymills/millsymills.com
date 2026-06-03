// Assert every executable inline <script> shipped in dist/ is allowlisted by a
// SHA-256 in the CloudFront CSP `script-src`.
//
// `script-src` is 'self' plus pinned hashes, so an inline script whose bytes
// aren't pinned is silently CSP-blocked at runtime. The block is invisible
// locally — `astro preview` serves no CSP; only prod CloudFront enforces it —
// so this class of bug ships green and only surfaces in the browser console on
// prod (#645: the unifi-demo loader inlined itself, got blocked, demo never
// loaded). assert-flags-init-csp.sh proves the one expected hash IS pinned;
// this proves nothing UNexpected ships. Runs after `npm run build`.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CF_TF = 'infra/cloudfront.tf';
const EXECUTABLE_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

function allowedHashes() {
	const tf = readFileSync(CF_TF, 'utf8');
	const hashes = new Set();
	for (const line of tf.split('\n')) {
		const directive = /script-src\s+([^;"]+)/.exec(line);
		if (!directive) continue;
		for (const m of directive[1].matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)) hashes.add(m[1]);
	}
	return hashes;
}

function distHtmlFiles() {
	return execFileSync('find', ['dist', '-name', '*.html'], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.filter(Boolean);
}

function inlineScriptType(attrs) {
	const m = /type\s*=\s*["']([^"']+)["']/i.exec(attrs);
	return m ? m[1].trim().toLowerCase() : '';
}

const allowed = allowedHashes();
if (allowed.size === 0) {
	console.error(`✗ no script-src hash found in ${CF_TF}`);
	process.exit(2);
}

const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const violations = new Map();
for (const file of distHtmlFiles()) {
	const html = readFileSync(file, 'utf8');
	for (const m of html.matchAll(re)) {
		const body = m[2];
		if (body.trim() === '') continue;
		if (!EXECUTABLE_TYPES.has(inlineScriptType(m[1]))) continue;
		const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
		if (allowed.has(hash)) continue;
		if (!violations.has(hash)) {
			violations.set(hash, { sample: body.slice(0, 90).replace(/\s+/g, ' ').trim(), files: new Set() });
		}
		violations.get(hash).files.add(file.replace(/^dist\//, ''));
	}
}

if (violations.size > 0) {
	console.error('✗ stray inline <script> not allowlisted in the CloudFront CSP:');
	for (const [hash, info] of violations) {
		const where = [...info.files].slice(0, 4).join(', ');
		const more = info.files.size > 4 ? ` (+${info.files.size - 4} more)` : '';
		console.error(`\n  ${hash}`);
		console.error(`    files: ${where}${more}`);
		console.error(`    body:  ${info.sample}…`);
	}
	console.error(
		`\nFix: import the script from a module so Astro bundles it to an external\n` +
			`     _astro/*.js (covered by script-src 'self') — see UniFi.astro. Only the\n` +
			`     pre-paint flag-unlock bootstrap is meant to ship inline (and is pinned).`,
	);
	process.exit(1);
}

console.log(`✓ every executable inline script in dist/ is CSP-allowlisted (${allowed.size} pinned hash(es))`);
