// @ts-check
import { defineConfig } from 'astro/config';
import { execFileSync } from 'node:child_process';

function readGitSha() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (process.env.CI === 'true') {
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

const siteUrl = process.env.SITE_URL ?? 'https://millsymills.com';
const noIndex = process.env.NO_INDEX === 'true';

// Footgun guards — fail the build rather than deploy wrong.
try {
	new URL(siteUrl);
} catch {
	throw new Error(`astro.config: SITE_URL is not a valid URL: ${siteUrl}`);
}

if (noIndex && siteUrl.includes('millsymills.com')) {
	throw new Error(
		`astro.config: refusing to build with NO_INDEX=true and SITE_URL pointing at millsymills.com (${siteUrl}). This combination would ship a noindexed build to the production domain.`,
	);
}

if (process.env.CI === 'true' && !process.env.SITE_URL) {
	throw new Error(
		'astro.config: SITE_URL must be set in CI builds. Local dev defaults to https://millsymills.com.',
	);
}

/**
 * Vite plugin: when a source file is loaded via `?raw` into the vscode
 * file-tree snippet bundler, strip any hardcoded production URL from the
 * snippet. Real source files legitimately embed `https://millsymills.com`
 * inside `Astro.site ?? "..."` fallbacks, but our `assert-no-url-leakage.sh`
 * check rejects the literal anywhere in dist/. The snippets are evocative
 * view-source teasers, not runtime logic, so scrubbing is safe here.
 *
 * @returns {import('vite').Plugin}
 */
function scrubVscodeSnippets() {
	return {
		name: 'mills-scrub-vscode-snippets',
		enforce: /** @type {const} */ ('pre'),
		transform(/** @type {string} */ code, /** @type {string} */ id) {
			if (!id.includes('?raw')) return null;
			// Only scrub the specific snippet imports used by vscode.exe so we
			// don't quietly rewrite real configuration or data files.
			const snippetTargets = [
				'/src/pages/index.astro',
				'/src/data/apps.ts',
				'/public/files/resume.md',
			];
			if (!snippetTargets.some((p) => id.includes(p))) return null;
			return code.replace(/https:\/\/millsymills\.com/g, '<site>');
		},
	};
}

export default defineConfig({
	output: 'static',
	site: siteUrl,
	vite: {
		define: {
			'import.meta.env.NO_INDEX': JSON.stringify(noIndex ? 'true' : 'false'),
			'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha),
		},
		plugins: [scrubVscodeSnippets()],
	},
});
