import type { APIRoute } from 'astro';

const PERMISSIVE_BODY = (sitemapUrl: string) => `# robots.txt — millsymills.com
#
# This site is released under MIT and is explicitly friendly to both
# search crawlers and AI agents. Indexing, summarizing, and training
# are all welcome. Agents looking for a fast path to the content:
#
#   /llms.txt       — summary + key links, markdown
#   /llms-full.txt  — full site content serialized as markdown
#   /files/resume.md — machine-readable resume
#   /sitemap.xml    — every page

User-agent: *
Allow: /
Disallow: /super-secret/

# Cloudflare Content Signals — consent for search + AI training
Content-Signal: search=yes, ai-input=yes, ai-train=yes

# Explicit per-bot welcomes so nobody has to guess
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: ${sitemapUrl}
`;

const REHEARSAL_BODY = (sitemapUrl: string) => `# robots.txt — rehearsal build
#
# This deployment is a deployment dress rehearsal. All crawlers and
# agents are disallowed to avoid duplicate-content indexing.

User-agent: *
Disallow: /

Sitemap: ${sitemapUrl}
`;

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('robots.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');
	const sitemapUrl = `${origin}/sitemap.xml`;
	const body =
		import.meta.env.NO_INDEX === 'true' ? REHEARSAL_BODY(sitemapUrl) : PERMISSIVE_BODY(sitemapUrl);

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
