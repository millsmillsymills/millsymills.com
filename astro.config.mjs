// @ts-check
import { defineConfig } from 'astro/config';
import { execFileSync } from 'node:child_process';

function readGitSha() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch {
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

export default defineConfig({
	output: 'static',
	site: siteUrl,
	vite: {
		define: {
			'import.meta.env.NO_INDEX': JSON.stringify(noIndex ? 'true' : 'false'),
			'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha),
		},
	},
});
