import type { APIRoute } from 'astro';
import { apps } from '../data/apps';
import { profile } from '../data/profile';
import { pgp } from '../data/pgp';
import { REPO_URL } from '../data/security-controls';

// /llms.txt — agent-readable summary, derived from typed data sources.
//
// Why generated rather than hand-maintained: the previous static file
// under src/data/llms.txt fell out of sync whenever a new app landed
// (privacy, security, vscode, projects, uses, incidents — all missed
// at least once). The page list below now iterates apps.ts directly,
// so adding a new app to the desktop automatically surfaces it to LLM
// consumers. Same shape as the existing sitemap.xml.ts derivation.

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');

	const pages = apps
		.map((a) => `- [${a.label}](${origin}/${a.id}/): ${a.ogDescription}`)
		.join('\n');

	const body = `# ${profile.handle}

> ${profile.name} (\`${profile.handle}\`) — ${profile.title} at ${profile.currentEmployer}.
> Based in ${profile.location}. 10+ years across identity and access
> management, endpoint security, and security automation.

This site is a personal portfolio styled as a Y2K-pink retro desktop.
It's released under MIT as a community template — fork it if you like
the layout.

## pages

${pages}

## machine-readable

- [resume.md](${origin}/files/resume.md) — full resume as markdown.
- [llms-full.txt](${origin}/llms-full.txt) — the entire site serialized
  as markdown, one file.
- [sitemap.xml](${origin}/sitemap.xml) — canonical URL list.
- [.well-known/security.txt](${origin}/.well-known/security.txt) — RFC
  9116 security contact + PGP, points at /security/ for the controls
  registry.
- [.well-known/sbom.spdx.json](${origin}/.well-known/sbom.spdx.json) —
  SPDX SBOM regenerated on every deploy.

## tech

- Astro 6 static output.
- Terraform for AWS (S3 + CloudFront + Route53 + ACM).
- CI via GitHub Actions with OIDC deploy role.
- Source: <${REPO_URL}>.

## contact

- email: <mailto:${profile.email}>
- pgp: <${origin}${pgp.downloadPath}> (fingerprint \`${pgp.fingerprint}\`, expires ${pgp.expiresAt})
- github: <${profile.github}>
`;

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
