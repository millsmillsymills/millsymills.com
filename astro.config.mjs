// @ts-check
import { defineConfig } from 'astro/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROJECT_SNIPPETS } from './src/scripts/vscode/snippet-manifest.mjs';
import { prerenderHighlights } from './src/scripts/vscode/highlight-build.mjs';

const URL_SCRUB_PATHS = PROJECT_SNIPPETS.filter((s) => s.scrubUrl).map((s) => s.rawImportPath);

function readGitSha() {
	if (process.env['GITHUB_SHA']) return process.env['GITHUB_SHA'];
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (process.env['CI'] === 'true') {
			throw new Error(
				`astro.config: could not resolve git SHA in CI (GITHUB_SHA unset, git fallback failed: ${msg}). Refusing to ship an unverifiable build — the /privacy/ attestation footer depends on this.`,
			);
		}
		console.warn(
			`[astro.config] git rev-parse failed (${msg}); PUBLIC_GIT_SHA='unknown' for local dev.`,
		);
		return 'unknown';
	}
}
const gitSha = readGitSha();

/**
 * Capture the last `n` commits at build time for vscode.exe's SCM panel.
 * Format: TAB-separated `hash<TAB>subject<TAB>iso-date`. Plain `git log`
 * is enough — no shell, fixed argv (no injection surface) like readGitSha.
 *
 * Soft-fails to `[]` rather than throwing in CI: the SCM panel is
 * decorative chrome, not a verifiability artifact like the SHA. Worst
 * case the panel renders "no commit history available" and the rest of
 * the site ships fine.
 *
 * @param {number} n
 * @returns {Array<{hash: string, subject: string, dateIso: string}>}
 */
function readGitLog(n) {
	try {
		const raw = execFileSync(
			'git',
			['log', '-n', String(n), '--pretty=format:%H%x09%s%x09%aI'],
			{ encoding: 'utf8' },
		).trim();
		if (!raw) return [];
		return raw.split('\n').map((line) => {
			const [hash, subject, dateIso] = line.split('\t');
			return { hash: hash ?? '', subject: subject ?? '', dateIso: dateIso ?? '' };
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			`[astro.config] git log failed (${msg}); PUBLIC_GIT_LOG=[] (vscode.exe SCM panel will be empty).`,
		);
		return [];
	}
}
const gitLog = readGitLog(20);

/**
 * Build-time PoW manifest for /mail/. The address is XOR-encrypted with a
 * key derived from the *first* SHA-256 nonce that produces a digest with
 * `bits` leading zero bits. The browser worker reproduces the search to
 * find the same nonce, then decrypts. Casual scrapers (curl, wget, simple
 * bots) see only the encrypted blob; running JS scrapers also have to
 * spend ~16K hashes (~150-800ms wall-clock) to win.
 *
 * Determinism: both ends must agree on the *lowest* satisfying nonce, so
 * the search is monotonic from 0. Difficulty 14 = ~16K iterations average.
 *
 * @param {string} email
 * @param {string} salt
 * @param {number} bits
 * @returns {{salt: string, difficultyBits: number, encryptedB64: string}}
 */
function buildMailPowManifest(email, salt, bits) {
	let nonce = 0;
	const cap = 1 << 24;
	while (nonce < cap) {
		const h = createHash('sha256').update(`${salt}:${nonce}`).digest();
		if (leadingZeroBitsBuf(h) >= bits) break;
		nonce++;
	}
	if (nonce === cap) {
		throw new Error(`astro.config: mail-pow could not find a nonce within 2^24 attempts at difficulty ${bits}.`);
	}
	const key = createHash('sha256').update(`${salt}:${nonce}:key`).digest();
	const data = Buffer.from(email, 'utf8');
	const cipher = Buffer.alloc(data.length);
	for (let i = 0; i < data.length; i++) cipher[i] = (data[i] ?? 0) ^ (key[i % key.length] ?? 0);
	return { salt, difficultyBits: bits, encryptedB64: cipher.toString('base64') };
}

/** @param {Buffer} buf */
function leadingZeroBitsBuf(buf) {
	let zeros = 0;
	for (const b of buf) {
		if (b === 0) { zeros += 8; continue; }
		let x = b;
		while ((x & 0x80) === 0) { zeros++; x <<= 1; }
		return zeros;
	}
	return zeros;
}

const mailPow = buildMailPowManifest('mills@millsymills.com', 'mills.mail.v1', 14);

/**
 * Prerendered shiki HTML for vscode.exe's editor pane. Computed once at
 * config-eval time; baked into the bundle as a literal so shiki itself
 * never reaches the runtime. See src/scripts/vscode/highlight-build.mjs
 * for the inputs and the soft-fail rationale.
 */
const vscodeHighlights = await prerenderHighlights();

/**
 * Vite plugin: when a source file is loaded via `?raw` into the vscode
 * file-tree snippet bundler, strip any hardcoded production URL from the
 * snippet. Source files embed `https://millsymills.com` literally, but
 * dist/ must not expose the production URL in snippet blobs. The snippets
 * are evocative view-source teasers, not runtime logic, so scrubbing is
 * safe here.
 *
 * The list of files to scrub is derived from src/scripts/vscode/snippet-manifest.mjs
 * (entries with `scrubUrl: true`) — the same manifest file-tree.ts and
 * highlight-build.mjs read so all three consumers agree on the curated set.
 *
 * @returns {import('vite').Plugin}
 */
function scrubVscodeSnippets() {
	return {
		name: 'mills-scrub-vscode-snippets',
		enforce: /** @type {const} */ ('pre'),
		transform(/** @type {string} */ code, /** @type {string} */ id) {
			if (!id.includes('?raw')) return null;
			if (!URL_SCRUB_PATHS.some((p) => id.includes(p))) return null;
			return code.replace(/https:\/\/millsymills\.com/g, '<site>');
		},
	};
}

/** @type {Map<string, string>} */
const chunkSlugToId = new Map();

export default defineConfig({
	output: 'static',
	site: 'https://millsymills.com',
	vite: {
		define: {
			'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha),
			// Single JSON.stringify: Vite substitutes the literal `[{...}, ...]`
			// at build time, so consumers get a real array (no JSON.parse needed).
			'import.meta.env.PUBLIC_GIT_LOG': JSON.stringify(gitLog),
			// Single JSON.stringify: substituted as a literal object at build.
			'import.meta.env.PUBLIC_MAIL_POW': JSON.stringify(mailPow),
			// Prerendered shiki HTML for vscode.exe — substituted as a literal
			// `Record<vscodePath, html>` object. editor.ts reads this once and
			// looks up by tab path; missing entries fall through to plain text.
			'import.meta.env.PUBLIC_VSCODE_HIGHLIGHTS': JSON.stringify(vscodeHighlights),
		},
		plugins: [scrubVscodeSnippets()],
		build: {
			// Force each src/scripts module into its own chunk so it's emitted
			// as `<script type="module" src="/_astro/…js">` instead of inlined
			// into HTML, where the production CSP `script-src 'self'` would
			// block it. Component `<script>` blocks already ship external via
			// the bundler's default per-entry splitting; dist/ is asserted
			// clean by scripts/assert-no-stray-inline-scripts.mjs.
			rollupOptions: {
				output: {
					// Chunk names must not be path-shaped: rolldown rejects
					// absolute/relative paths in the `[name]` substitution, so
					// the module id is slugified instead of returned verbatim.
					// Two modules merging into one chunk would re-inline the
					// survivor past the CSP guard, so slug collisions are a
					// build failure, not a warning.
					manualChunks(id) {
						if (!/src\/scripts\/[^/]+\.ts$/.test(id)) {
							return undefined;
						}
						const srcIdx = id.lastIndexOf('/src/');
						// Off-src ids fall back to the last path segment so an
						// absolute host path can never reach a public dist/ filename.
						const scoped = srcIdx === -1 ? (id.split('/').pop() ?? id) : id.slice(srcIdx + 1);
						const slug = scoped.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
						const prior = chunkSlugToId.get(slug);
						if (prior !== undefined && prior !== id) {
							throw new Error(
								`manualChunks slug collision: "${slug}" maps to both "${prior}" and "${id}" — rename one module`,
							);
						}
						chunkSlugToId.set(slug, id);
						return slug;
					},
				},
			},
		},
	},
});
