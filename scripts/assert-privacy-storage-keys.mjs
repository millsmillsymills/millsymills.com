#!/usr/bin/env node
//
// Assert every (storage, key) pair the client scripts actually use is
// documented in src/data/privacy-copy.ts. The privacy page's whole premise
// is verifiable accuracy — drift between what we say we store and what we
// actually store silently breaks that promise.
//
// What this script catches:
//   - new localStorage/sessionStorage.setItem call without a privacy entry
//   - mis-categorising a key as `local` when it's used in `sessionStorage`
//     (or vice versa)
//   - a key removed from code but still claimed in privacy-copy
//
// What it does NOT catch:
//   - dynamic keys built at runtime (e.g. `localStorage.setItem(\`foo.\${x}\`)`)
//   - keys written via prefix scans like reset.ts's `localStorage.key(i)`
//     loop — these are walking ALL `mills.*` keys, not naming a specific one
//
// Usage: node scripts/assert-privacy-storage-keys.mjs
// Wired into scripts/ci-local.sh.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const SCRIPTS_DIR = join(ROOT, 'src', 'scripts');
const PRIVACY_COPY = join(ROOT, 'src', 'data', 'privacy-copy.ts');

function listTsFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...listTsFiles(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

// Map of `const NAME = '<string>'` declarations in a file. Catches the
// STORAGE_KEY / SESSION_KEY pattern. Doesn't follow imports here — the
// caller resolves imports lazily via resolveIdentifier().
function collectStringConstants(source) {
	const out = new Map();
	const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*['"`]([^'"`]+)['"`]/g;
	for (const m of source.matchAll(re)) {
		out.set(m[1], m[2]);
	}
	return out;
}

// `import { STORAGE_KEY } from './foo';` style — returns [{ names, from }].
function collectImports(source) {
	const out = [];
	const re = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
	for (const m of source.matchAll(re)) {
		const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
		out.push({ names, from: m[2] });
	}
	return out;
}

function resolveImportPath(fromFile, spec) {
	if (!spec.startsWith('.')) return null;
	const base = resolve(fromFile, '..', spec);
	for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
		const p = base + ext;
		try {
			if (statSync(p).isFile()) return p;
		} catch {}
	}
	return null;
}

function resolveIdentifier(file, source, name, depth = 0) {
	if (depth > 2) return null;
	const local = collectStringConstants(source);
	if (local.has(name)) return local.get(name);
	for (const imp of collectImports(source)) {
		if (!imp.names.includes(name)) continue;
		const p = resolveImportPath(file, imp.from);
		if (!p) continue;
		const v = resolveIdentifier(p, readFileSync(p, 'utf8'), name, depth + 1);
		if (v) return v;
	}
	return null;
}

function findStorageCalls(source) {
	const out = [];
	const re = /\b(localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(\s*([^,)]+?)\s*(?:[,)])/g;
	for (const m of source.matchAll(re)) {
		const storage = m[1] === 'localStorage' ? 'local' : 'session';
		const arg = m[2].trim();
		const line = source.slice(0, m.index).split('\n').length;
		out.push({ storage, arg, line });
	}
	return out;
}

function parsePrivacyKeys() {
	const src = readFileSync(PRIVACY_COPY, 'utf8');
	const arrayRe = /export const browserStorageKeys[^=]*=\s*\[([\s\S]*?)\];/m;
	const arr = src.match(arrayRe);
	if (!arr) {
		console.error('FAIL: could not locate browserStorageKeys array in', relative(ROOT, PRIVACY_COPY));
		process.exit(1);
	}
	const out = [];
	const entryRe = /\{\s*key:\s*['"]([^'"]+)['"],\s*storage:\s*['"](local|session)['"]/g;
	for (const m of arr[1].matchAll(entryRe)) {
		out.push({ key: m[1], storage: m[2] });
	}
	return out;
}

function fmtPair({ storage, key }) {
	return `${storage}:${key}`;
}

function main() {
	const files = listTsFiles(SCRIPTS_DIR);
	const usedSet = new Map();
	const unresolved = [];

	for (const f of files) {
		const source = readFileSync(f, 'utf8');
		for (const call of findStorageCalls(source)) {
			let key = null;
			if (/^['"`]/.test(call.arg)) {
				key = call.arg.slice(1, -1);
			} else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(call.arg)) {
				key = resolveIdentifier(f, source, call.arg);
				if (!key) {
					unresolved.push({ file: relative(ROOT, f), line: call.line, arg: call.arg });
					continue;
				}
			} else {
				unresolved.push({ file: relative(ROOT, f), line: call.line, arg: call.arg });
				continue;
			}
			const pair = fmtPair({ storage: call.storage, key });
			const list = usedSet.get(pair) ?? [];
			list.push(`${relative(ROOT, f)}:${call.line}`);
			usedSet.set(pair, list);
		}
	}

	const documented = new Set(parsePrivacyKeys().map(fmtPair));

	const undocumented = [];
	for (const [pair, locations] of usedSet) {
		if (!documented.has(pair)) undocumented.push({ pair, locations });
	}
	const stale = [];
	for (const pair of documented) {
		if (!usedSet.has(pair)) stale.push(pair);
	}

	console.log(`scanned ${files.length} script files`);
	console.log(`used pairs: ${usedSet.size}`);
	console.log(`documented pairs: ${documented.size}`);

	let failed = false;
	if (undocumented.length) {
		failed = true;
		console.error('\nFAIL: storage pair used in code but missing from privacy-copy.ts:');
		for (const { pair, locations } of undocumented) {
			console.error(`  - ${pair}  (${locations.join(', ')})`);
		}
	}
	if (stale.length) {
		failed = true;
		console.error('\nFAIL: storage pair documented in privacy-copy.ts but not used in any script:');
		for (const pair of stale) {
			console.error(`  - ${pair}`);
		}
	}
	if (failed) {
		console.error(
			'\nFix: update src/data/privacy-copy.ts so browserStorageKeys matches the (storage, key) pairs actually written by src/scripts/.',
		);
		process.exit(1);
	}
	// Always surface the size of the unchecked bucket — growth of the
	// skipped set is otherwise invisible in CI (#841). VERBOSE adds the
	// per-call-site detail.
	console.log(`skipped dynamic-arg calls: ${unresolved.length}`);
	if (unresolved.length && process.env.VERBOSE) {
		for (const u of unresolved) console.log(`  ${u.file}:${u.line} arg=${u.arg}`);
	}
	console.log('\nok: privacy-copy.ts and src/scripts/ agree on browser storage');
}

main();
