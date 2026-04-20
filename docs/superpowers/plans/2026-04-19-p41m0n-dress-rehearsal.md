# p41m0n.com Dress Rehearsal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the code, Terraform, and tooling changes that let us rehearse the full millsymills.com AWS deployment runbook against p41m0n.com end-to-end, per the design in `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`. This plan produces only the *codebase* changes — the actual registrar cutover + AWS apply + verification are operational steps run from the final task's runbook.

**Architecture:** One Astro codebase that emits domain-correct URLs driven by `SITE_URL` + `NO_INDEX` env vars; one Terraform root supporting two stacks (`millsymills`, `p41m0n`) via per-stack `-backend-config` + `-var-file` switched by a `scripts/tf.sh` wrapper; one new `deploy-rehearsal.yml` workflow targeting a separate GitHub Environment. A post-build `assert-no-url-leakage.sh` grep-test is the cross-cutting safety net.

**Tech Stack:** Astro 6 (static output), Terraform 1.10+ (S3 backend with native locking), AWS (S3 + CloudFront + Route53 + ACM + IAM OIDC), GitHub Actions, Bash/zsh for tooling, Gandi LiveDNS API for the DNS snapshot.

---

## File Structure

Files created or modified, grouped by responsibility:

**Build pipeline (Phase 1) — domain-correct URL emission**
- `astro.config.mjs` (edit) — SITE_URL-driven `site`; vite defines for NO_INDEX; build-time assertions.
- `src/layouts/BaseLayout.astro` (edit) — `noindex` meta when build flag OR prop.
- `src/layouts/DesktopLayout.astro` (edit) — noindex meta + JSON-LD URLs from `Astro.site`.
- `src/pages/index.astro` (edit) — canonical/ogUrl from `Astro.site`.
- `src/pages/[app].astro` (edit) — canonical/ogImage from `Astro.site`.
- `src/pages/sitemap.xml.ts` (edit) — `SITE` from `Astro.site`.
- `src/pages/robots.txt.ts` (new) — replaces `public/robots.txt`; conditional disallow-all.
- `src/pages/llms.txt.ts` (new) — replaces `public/llms.txt`; URLs from Astro.site.
- `src/pages/llms-full.txt.ts` (new) — replaces `public/llms-full.txt`; URLs from Astro.site.
- `public/robots.txt` (delete).
- `public/llms.txt` (delete) — scope added after Task 6 surfaced 12 hardcoded URL hits.
- `public/llms-full.txt` (delete) — scope added after Task 6 surfaced 2 hardcoded URL hits.
- `scripts/assert-no-url-leakage.sh` (new) — post-build grep for hardcoded prod URLs.

**Terraform two-stack isolation (Phase 2)**
- `infra/main.tf` (edit) — activate empty `backend "s3" {}`.
- `infra/stacks/millsymills.tfvars` (new).
- `infra/stacks/p41m0n.tfvars` (new).
- `infra/stacks/millsymills.backend.hcl` (new).
- `infra/stacks/p41m0n.backend.hcl` (new).
- `infra/outputs.tf` (edit) — expose `route53_nameservers`.
- `scripts/tf.sh` (new) — stack-aware wrapper with stale-state guard.

**Rehearsal tooling (Phase 3)**
- `scripts/gandi-snapshot.sh` (new).
- `scripts/verify-p41m0n.sh` (new).

**CI (Phase 4)**
- `.github/workflows/deploy-rehearsal.yml` (new).

**Docs (Phase 5)**
- `CLAUDE.md` (edit) — update migration runbook to match the new backend-config pattern + TTL honesty.

**Tooling glue**
- `scripts/ci-local.sh` (edit) — include the URL-leakage assertion and `tf.sh` refusal tests.
- `.gitignore` (edit) — ensure `.local/` is ignored for snapshot outputs.

---

## Task 1: Install the build-output leakage guard

Before touching any Astro code, wire up the cross-cutting assertion that will drive the rest of Phase 1. Runs `npm run build` with rehearsal env, then greps `dist/` for `https://millsymills.com` as a literal substring. Any hit fails the build. Bare `millsymills.com` (without `https://`) is allowed — that's brand text in OG images, emails, etc.

**Files:**
- Create: `scripts/assert-no-url-leakage.sh`
- Modify: `scripts/ci-local.sh`

- [ ] **Step 1: Create the leakage-assertion script**

Write `scripts/assert-no-url-leakage.sh`:

```bash
#!/usr/bin/env bash
#
# Build with rehearsal env and confirm no production URL leaks into dist/.
# Any hit on the literal "https://millsymills.com" outside the allow-list
# below is a leak.
#
# Bare "millsymills.com" (brand text in OG SVGs, emails, project names) is
# allowed — this script only matches URL-form hardcodes.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BUILD_DIR=dist
STAGE_SITE_URL="https://p41m0n.com"

export SITE_URL="$STAGE_SITE_URL"
export NO_INDEX=true

printf '\n\033[1;36m== assert-no-url-leakage: rehearsal build ==\033[0m\n'
rm -rf "$BUILD_DIR"
npm run build

printf '\n\033[1;36m== grep dist/ for https://millsymills.com ==\033[0m\n'

# -r: recursive. -n: line numbers. -I: skip binary files.
# Allow-list paths go after `--exclude` if we ever need them; none today.
if grep -rInI 'https://millsymills\.com' "$BUILD_DIR"; then
	printf '\n\033[1;31m✗ URL leakage detected: dist/ contains hardcoded https://millsymills.com.\033[0m\n'
	printf '   Fix: derive all emitted URLs from Astro.site, not string literals.\n'
	exit 1
fi

printf '\n\033[1;32m✓ no URL leakage\033[0m\n'
```

Make it executable: `chmod +x scripts/assert-no-url-leakage.sh`.

- [ ] **Step 2: Run the script to confirm it fails on current HEAD**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: build succeeds, grep finds matches (at least in `dist/sitemap.xml`, `dist/robots.txt`, and generated HTML), script exits 1 with "URL leakage detected".

This is the failing test that drives tasks 2–9.

- [ ] **Step 3: Add the script to `scripts/ci-local.sh`**

Modify `scripts/ci-local.sh` — add a new section after the existing "node: build" section:

```bash
section "node: assert no URL leakage in rehearsal build"
./scripts/assert-no-url-leakage.sh
ok "no URL leakage"
```

(Insert between the existing `ok "npm run build"` line and `section "node: astro check"`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/assert-no-url-leakage.sh scripts/ci-local.sh
git commit -m "test(build): add URL-leakage assertion for rehearsal builds"
```

---

## Task 2: Parameterize `astro.config.mjs`

Drive the Astro `site` from `SITE_URL`, expose `NO_INDEX` as an `import.meta.env` value via vite defines, and add footgun-guard assertions.

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Rewrite the config**

Replace `astro.config.mjs` contents with:

```js
// @ts-check
import { defineConfig } from 'astro/config';

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
		},
	},
});
```

- [ ] **Step 2: Verify the existing prod build still works**

Run: `SITE_URL=https://millsymills.com npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify the CI-guard fires**

Run: `CI=true npm run build`
Expected: build fails with "SITE_URL must be set in CI builds".

- [ ] **Step 4: Verify the millsymills-with-noindex guard fires**

Run: `SITE_URL=https://millsymills.com NO_INDEX=true npm run build`
Expected: build fails with "refusing to build with NO_INDEX=true and SITE_URL pointing at millsymills.com".

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs
git commit -m "feat(build): drive astro site + NO_INDEX from env with guards"
```

---

## Task 3: Parameterize `src/layouts/DesktopLayout.astro`

Replace the four hardcoded `https://millsymills.com/` JSON-LD URLs with values derived from `Astro.site`, and emit a `noindex` meta when the build flag is set. Leave brand-text strings (`name`, `og:site_name`) alone.

**Files:**
- Modify: `src/layouts/DesktopLayout.astro`

- [ ] **Step 1: Edit the frontmatter (lines 1–43)**

Replace the existing frontmatter with:

```astro
---
import '../styles/desktop.css';
import { profile } from '../data/profile';

interface Props {
	title: string;
	description?: string;
	canonical?: string;
	ogUrl?: string;
	ogImage?: string;
	noindex?: boolean;
	/** App id to auto-open on load (overrides localStorage + ?open=). */
	initialOpen?: string;
}

const { title, description, canonical, ogUrl, ogImage, noindex, initialOpen } = Astro.props;

if (!Astro.site) {
	throw new Error('DesktopLayout: Astro.site is undefined. Check astro.config.mjs site value.');
}
const siteHref = Astro.site.href; // e.g. "https://p41m0n.com/"
const forceNoIndex = import.meta.env.NO_INDEX === 'true';

const jsonLd = {
	'@context': 'https://schema.org',
	'@graph': [
		{
			'@type': 'Person',
			'@id': `${siteHref}#mills`,
			name: profile.name,
			alternateName: profile.handle,
			jobTitle: profile.title,
			worksFor: { '@type': 'Organization', name: profile.currentEmployer },
			address: { '@type': 'PostalAddress', addressLocality: 'Seattle', addressRegion: 'WA' },
			email: `mailto:${profile.email}`,
			url: siteHref,
			sameAs: [profile.github],
		},
		{
			'@type': 'WebSite',
			'@id': `${siteHref}#website`,
			url: siteHref,
			name: 'millsymills.com',
			description: 'mills — corporate security engineer. portfolio + links.',
			author: { '@id': `${siteHref}#mills` },
			license: 'https://github.com/millsmillsymills/millsymills.com/blob/main/LICENSE',
		},
	],
};
---
```

Key changes from current:
- Added `noindex?: boolean` to Props.
- Destructured `noindex` from props.
- Introduced `siteHref` from `Astro.site.href`.
- Introduced `forceNoIndex` from build env.
- Replaced all four hardcoded `https://millsymills.com/#mills`, `https://millsymills.com/` with `${siteHref}#mills`, `siteHref`, etc. Brand strings (`name: 'millsymills.com'`, license URL, description) remain literal.

- [ ] **Step 2: Edit the head to emit noindex meta**

Find the `<head>` block (starts around line 46 in the original). Immediately after the `<meta name="generator" ...>` line and before the `{description && ...}` line, insert:

```astro
			{(noindex || forceNoIndex) && <meta name="robots" content="noindex,nofollow" />}
```

- [ ] **Step 3: Run the leakage assertion**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: still fails, but with fewer hits (`index.astro`, `[app].astro`, `sitemap.xml`, `robots.txt` remain). DesktopLayout's four hits are gone.

- [ ] **Step 4: Verify the prod build still produces correct millsymills URLs**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build && grep -c '"@id":"https://millsymills.com/#mills"' dist/index.html`
Expected: at least 1 match (JSON-LD emits the Person @id with the correct millsymills URL).

- [ ] **Step 5: Commit**

```bash
git add src/layouts/DesktopLayout.astro
git commit -m "feat(layout): derive DesktopLayout JSON-LD URLs from Astro.site"
```

---

## Task 4: Parameterize `src/layouts/BaseLayout.astro`

Add a build-time force-noindex path so the simple pages (404, etc.) that use BaseLayout also honor the rehearsal flag. Keep the existing per-page `noindex` prop semantics.

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Edit the frontmatter (lines 1–10)**

Replace the frontmatter with:

```astro
---
interface Props {
	title: string;
	description?: string;
	noindex?: boolean;
	canonical?: string;
}

const { title, description, noindex, canonical } = Astro.props;
const forceNoIndex = import.meta.env.NO_INDEX === 'true';
---
```

- [ ] **Step 2: Update the head noindex emission (line 20)**

Replace:

```astro
			{noindex && <meta name="robots" content="noindex" />}
```

with:

```astro
			{(noindex || forceNoIndex) && <meta name="robots" content="noindex,nofollow" />}
```

Note: normalizes the content to `noindex,nofollow` — matches DesktopLayout and the rehearsal spec.

- [ ] **Step 3: Run the leakage assertion**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: still fails on `index.astro`, `[app].astro`, `sitemap.xml`, `robots.txt`. No new hits.

- [ ] **Step 4: Confirm the 404 page still emits noindex under prod build**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build && grep 'meta name="robots"' dist/404.html`
Expected: one hit — the per-page `noindex` prop on 404.astro is still honored.

- [ ] **Step 5: Confirm force-noindex fires under rehearsal build**

Run: `rm -rf dist && SITE_URL=https://p41m0n.com NO_INDEX=true npm run build && grep -l 'noindex,nofollow' dist/404.html dist/index.html`
Expected: both files listed — force-noindex applies globally under rehearsal.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(layout): honor build-env NO_INDEX in BaseLayout"
```

---

## Task 5: Parameterize `src/pages/index.astro`

Replace hardcoded canonical + ogUrl with values computed from `Astro.site`. Current file is 22 lines, full before/after shown below.

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace the file contents**

Full new `src/pages/index.astro`:

```astro
---
import DesktopLayout from '../layouts/DesktopLayout.astro';
import Desktop from '../components/desktop/Desktop.astro';
import MobileFallback from '../components/desktop/MobileFallback.astro';
import CommandPalette from '../components/desktop/CommandPalette.astro';
import HelpOverlay from '../components/desktop/HelpOverlay.astro';
import ResetConfirm from '../components/desktop/ResetConfirm.astro';
import { profile } from '../data/profile';

const canonical = Astro.site?.href ?? 'https://millsymills.com/';
---

<DesktopLayout
	title={profile.handle}
	description={`${profile.title} @ ${profile.currentEmployer}. portfolio + links.`}
	canonical={canonical}
	ogUrl={canonical}
>
	<Desktop />
	<MobileFallback />
	<CommandPalette />
	<HelpOverlay />
	<ResetConfirm />
</DesktopLayout>
```

Diff from current: added one line to frontmatter computing `canonical` from `Astro.site`; replaced the two hardcoded URL strings with `{canonical}` references.

- [ ] **Step 3: Run the leakage assertion**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: still fails on `[app].astro`, `sitemap.xml`, `robots.txt`. `index.astro` hits are gone.

- [ ] **Step 4: Verify the prod canonical is still correct**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build && grep 'rel="canonical"' dist/index.html`
Expected: `<link rel="canonical" href="https://millsymills.com/">`

- [ ] **Step 5: Verify the rehearsal canonical is p41m0n**

Run: `rm -rf dist && SITE_URL=https://p41m0n.com NO_INDEX=true npm run build && grep 'rel="canonical"' dist/index.html`
Expected: `<link rel="canonical" href="https://p41m0n.com/">`

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(pages): derive index canonical from Astro.site"
```

---

## Task 6: Parameterize `src/pages/[app].astro`

Replace hardcoded canonical + ogImage URLs. The `[app].astro` file handles dynamic per-app routes; the canonical must include `/${app.id}/`.

**Files:**
- Modify: `src/pages/[app].astro`

- [ ] **Step 1: Locate and edit lines 21–22**

Replace:

```astro
const canonical = `https://millsymills.com/${app.id}/`;
const ogImage = `https://millsymills.com/og/${app.id}.svg`;
```

with:

```astro
const siteHref = Astro.site?.href ?? 'https://millsymills.com/';
const canonical = `${siteHref}${app.id}/`;
const ogImage = `${siteHref}og/${app.id}.svg`;
```

(Note: `Astro.site.href` ends with `/`, so we concatenate without a leading slash on `app.id`.)

- [ ] **Step 2: Run the leakage assertion**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: fails only on `sitemap.xml` and `robots.txt`. `[app].astro`-generated HTML has no more millsymills URLs.

- [ ] **Step 3: Verify a prod build of an app page**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build && ls dist/` — identify any `<appid>/index.html` directory, then:
Run: `grep 'rel="canonical"' dist/*/index.html | head -5`
Expected: all canonicals point at `https://millsymills.com/<appid>/`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/[app].astro
git commit -m "feat(pages): derive per-app canonical + ogImage from Astro.site"
```

---

## Task 7: Parameterize `src/pages/sitemap.xml.ts`

Replace the hardcoded `SITE` constant. `Astro.site` is available as a parameter in Astro endpoint handlers via the context object.

**Files:**
- Modify: `src/pages/sitemap.xml.ts`

- [ ] **Step 1: Rewrite the endpoint**

Replace the full contents of `src/pages/sitemap.xml.ts` with:

```ts
import type { APIRoute } from 'astro';
import { apps } from '../data/apps';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('sitemap.xml: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	// site.href ends with a trailing slash; strip it so paths we concatenate
	// don't produce double slashes.
	const origin = site.href.replace(/\/$/, '');

	const urls = [
		{ loc: `${origin}/`, priority: '1.0', changefreq: 'monthly' },
		...apps.map((a) => ({
			loc: `${origin}/${a.id}/`,
			priority: '0.8',
			changefreq: 'monthly',
		})),
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
	)
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
};
```

- [ ] **Step 2: Run the leakage assertion**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: fails only on `robots.txt`. `sitemap.xml` hits are gone.

- [ ] **Step 3: Verify prod sitemap**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build && head -5 dist/sitemap.xml`
Expected: `<loc>https://millsymills.com/</loc>` in the first entry.

- [ ] **Step 4: Verify rehearsal sitemap**

Run: `rm -rf dist && SITE_URL=https://p41m0n.com NO_INDEX=true npm run build && head -5 dist/sitemap.xml`
Expected: `<loc>https://p41m0n.com/</loc>` in the first entry.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sitemap.xml.ts
git commit -m "feat(pages): derive sitemap origin from Astro.site"
```

---

## Task 8: Replace static content files with dynamic endpoints

**SCOPE NOTE (added during execution):** During Task 6 the leakage assertion surfaced hardcoded URLs in `public/llms.txt` (12 hits) and `public/llms-full.txt` (2 hits) — files the original spec didn't enumerate. They follow the same static-content-needs-to-vary-by-env pattern as `robots.txt`, so Task 8 absorbs them. Final end-state: three static files in `public/` are replaced by three dynamic endpoints in `src/pages/`.

Static `public/*.txt` content cannot vary with env. Move each to an Astro endpoint that reads `Astro.site` for URLs and, where applicable, conditionally switches content based on `NO_INDEX`.

**Files:**
- Create: `src/pages/robots.txt.ts`
- Create: `src/pages/llms.txt.ts`
- Create: `src/pages/llms-full.txt.ts`
- Delete: `public/robots.txt`
- Delete: `public/llms.txt`
- Delete: `public/llms-full.txt`

- [ ] **Step 1: Create the new endpoint**

Write `src/pages/robots.txt.ts`:

```ts
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
```

- [ ] **Step 1b: Create `src/pages/llms.txt.ts`**

The current `public/llms.txt` is a markdown-shaped summary of the site for LLM consumers. Replace with an endpoint that reads `Astro.site` for all URL references. Derive `origin` as in Task 7 (`site.href.replace(/\/$/, '')`).

Write `src/pages/llms.txt.ts`:

```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');

	const body = `# mills

> Andrew Mills (\`mills\`) — Corporate Security Engineer at Trail of Bits.
> Based in Seattle, WA; works remote. 10+ years across identity and
> access management, endpoint security, and security automation.

This site is a personal portfolio styled as a Y2K-pink retro desktop.
It's released under MIT as a community template — fork it if you like
the layout.

## pages

- [about](${origin}/about/): bio, pronouns, contact.
- [resume](${origin}/resume/): rendered work history.
- [photos](${origin}/photos/): mostly cats.
- [terminal](${origin}/terminal/): a mock shell with
  help / ls / cat / nmap / curl / sudo / flag.
- [flags](${origin}/flags/): a Juice-Shop-style CTF.
  Ten hidden challenges at varied difficulty.
- [music](${origin}/music/): a toy winamp player.
- [memes](${origin}/memes/): small and earnest.
- [mail](${origin}/mail/): contact info.
- [trash](${origin}/trash/): deleted files, mostly
  garbage.

## machine-readable

- [resume.md](${origin}/files/resume.md) — full resume
  as markdown.
- [llms-full.txt](${origin}/llms-full.txt) — the entire
  site content concatenated into a single markdown file.
- [sitemap.xml](${origin}/sitemap.xml)
- [robots.txt](${origin}/robots.txt)
`;

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
```

**NOTE:** Before writing, READ `public/llms.txt` in full to preserve exact prose wording and structure. The above template is representative; match the current file's content verbatim except for swapping each `https://millsymills.com` → `${origin}`.

- [ ] **Step 1c: Create `src/pages/llms-full.txt.ts`**

The current `public/llms-full.txt` is the full site content serialized. Only 2 URL hits — straightforward substitution. Read the current file in full, port its contents byte-for-byte into a template literal in the endpoint, and swap the 2 hardcoded `https://millsymills.com` occurrences for `${origin}`.

Write `src/pages/llms-full.txt.ts`:

```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms-full.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');

	const body = `<<<PASTE THE CURRENT public/llms-full.txt CONTENTS HERE>>>`;

	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
```

When replacing `<<<PASTE...>>>` with the current file contents:
1. Escape any backticks in the content as `\``.
2. Escape any `${` sequences as `\${`.
3. Swap both `https://millsymills.com` → `${origin}`.

- [ ] **Step 2: Delete the static files**

Run: `git rm public/robots.txt public/llms.txt public/llms-full.txt`

- [ ] **Step 3: Run the leakage assertion — should now pass**

Run: `./scripts/assert-no-url-leakage.sh`
Expected: `✓ no URL leakage`. Exit 0.

- [ ] **Step 4: Verify prod robots.txt + llms variants**

Run: `rm -rf dist && SITE_URL=https://millsymills.com npm run build`

Then:
- `grep -E '^(User-agent|Disallow|Sitemap):' dist/robots.txt | head -5` — contains `Sitemap: https://millsymills.com/sitemap.xml` and permissive `Allow: /`.
- `grep -c 'https://millsymills.com' dist/llms.txt` — > 0 (URLs point at prod).
- `grep -c 'https://millsymills.com' dist/llms-full.txt` — > 0.

- [ ] **Step 5: Verify rehearsal robots.txt + llms variants**

Run: `rm -rf dist && SITE_URL=https://p41m0n.com NO_INDEX=true npm run build`

Then:
- `cat dist/robots.txt` — `User-agent: * / Disallow: /` and `Sitemap: https://p41m0n.com/sitemap.xml`.
- `grep -c 'https://millsymills.com' dist/llms.txt` — exactly 0.
- `grep -c 'https://p41m0n.com' dist/llms.txt` — > 0.
- `grep -c 'https://millsymills.com' dist/llms-full.txt` — exactly 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/robots.txt.ts src/pages/llms.txt.ts src/pages/llms-full.txt.ts public/robots.txt public/llms.txt public/llms-full.txt
git commit -m "feat(pages): robots.txt + llms.txt + llms-full.txt as env-aware endpoints"
```

---

## Task 9: Activate the Terraform backend block

Change `infra/main.tf` so `backend "s3"` is an empty block, with all config supplied via `-backend-config` at init. This is the prerequisite for per-stack state isolation.

**Files:**
- Modify: `infra/main.tf`

- [ ] **Step 1: Edit the terraform block (lines 1–22)**

Replace the commented-out backend block with an active empty one:

```terraform
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
    }
  }

  # All backend fields (bucket, key, region, encrypt, use_lockfile) are
  # supplied per-stack via `terraform init -backend-config=...`. See
  # infra/stacks/*.backend.hcl and scripts/tf.sh. An empty block here is
  # required for Terraform to recognize the S3 backend at all.
  backend "s3" {}
}
```

- [ ] **Step 2: Confirm terraform syntax still validates without a backend config**

Run: `terraform -chdir=infra init -backend=false -input=false -reconfigure`
Expected: init succeeds (in `-backend=false` mode, the empty block is OK).

Run: `terraform -chdir=infra validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Confirm terraform fmt passes**

Run: `terraform -chdir=infra fmt -check -recursive`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add infra/main.tf
git commit -m "chore(infra): activate empty S3 backend block for per-stack init"
```

---

## Task 10: Create per-stack tfvars + backend-config files

**Files:**
- Create: `infra/stacks/millsymills.tfvars`
- Create: `infra/stacks/p41m0n.tfvars`
- Create: `infra/stacks/millsymills.backend.hcl`
- Create: `infra/stacks/p41m0n.backend.hcl`

- [ ] **Step 1: Create the stacks directory**

Run: `mkdir -p infra/stacks`

- [ ] **Step 2: Write `infra/stacks/millsymills.backend.hcl`**

```hcl
bucket       = "millsymills-terraform-state"
key          = "millsymills.com/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
```

- [ ] **Step 3: Write `infra/stacks/p41m0n.backend.hcl`**

```hcl
bucket       = "millsymills-terraform-state"
key          = "p41m0n.com/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
```

- [ ] **Step 4: Write `infra/stacks/millsymills.tfvars`**

```hcl
aws_region    = "us-east-1"
domain        = "millsymills.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"

# ProtonMail vars — leave blank until Proton is activated.
# See CLAUDE.md "Email (ProtonMail)" runbook for the sequence.
# protonmail_verification_token = ""
# protonmail_dkim_selectors     = {}
```

- [ ] **Step 5: Write `infra/stacks/p41m0n.tfvars`**

```hcl
aws_region    = "us-east-1"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"

# p41m0n rehearsal does not activate ProtonMail; email.tf publishes
# null-MX + strict DMARC in this state. User does not use p41m0n mail.
```

- [ ] **Step 6: Ensure `.local/` is gitignored for snapshot output**

Check `.gitignore`:

```bash
grep -q '^\.local/$' .gitignore || echo '.local/' >> .gitignore
```

- [ ] **Step 7: terraform fmt on the new files**

Run: `terraform fmt -recursive infra/`
Expected: no changes (files should be formatted correctly already); if any are reformatted, commit the formatted versions.

- [ ] **Step 8: Commit**

```bash
git add infra/stacks/ .gitignore
git commit -m "feat(infra): stacks/ with per-stack tfvars + backend config"
```

---

## Task 11: Write `scripts/tf.sh` wrapper

Stack-aware Terraform wrapper. Enforces per-stack init + var-file, checks for stale local state before applies.

**Files:**
- Create: `scripts/tf.sh`

- [ ] **Step 1: Write the wrapper**

```bash
#!/usr/bin/env bash
#
# Stack-aware Terraform wrapper. Usage:
#   ./scripts/tf.sh <stack> <terraform-args...>
#
# Valid stacks: millsymills, p41m0n.
# The wrapper enforces:
#   - per-stack backend-config at init
#   - per-stack -var-file on plan/apply/destroy/refresh
#   - stale-state guard via a marker file written at init

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

STACK="${1:-}"
shift || true

case "$STACK" in
	millsymills|p41m0n) ;;
	*)
		printf '\033[1;31mrefusing: stack must be one of [millsymills, p41m0n], got %q\033[0m\n' "$STACK" >&2
		exit 2
		;;
esac

MARKER="infra/.terraform/.stack"
BACKEND_CFG="infra/stacks/${STACK}.backend.hcl"

printf '\033[1;36m== tf.sh: stack=%s ==\033[0m\n' "$STACK"

SUBCMD="${1:-}"

init_stack() {
	terraform -chdir=infra init -reconfigure -backend-config="stacks/${STACK}.backend.hcl" -input=false
	# Record which stack this working dir is initialized for. Read by
	# stale_state_guard below. Written AFTER a successful init so a
	# failed init doesn't leave a stale marker.
	printf '%s\n' "$STACK" > "$MARKER"
}

stale_state_guard() {
	# Only run for commands that touch remote state.
	case "$SUBCMD" in
		apply|destroy|plan|refresh|import|state|output|console|show) ;;
		*) return 0 ;;
	esac

	if [[ ! -f "$MARKER" ]]; then
		printf '\033[1;31mrefusing: %s missing; run `./scripts/tf.sh %s init` first\033[0m\n' "$MARKER" "$STACK" >&2
		exit 3
	fi

	local current_stack
	current_stack="$(cat "$MARKER")"

	if [[ "$current_stack" != "$STACK" ]]; then
		printf '\033[1;31mrefusing: infra/.terraform initialized for stack %q, this command targets %q. Run `./scripts/tf.sh %s init` to re-init.\033[0m\n' "$current_stack" "$STACK" "$STACK" >&2
		exit 4
	fi
}

case "$SUBCMD" in
	init)
		init_stack
		;;
	plan|apply|destroy|refresh)
		stale_state_guard
		terraform -chdir=infra "$SUBCMD" -var-file="stacks/${STACK}.tfvars" "${@:2}"
		;;
	output|state|import|console|show)
		stale_state_guard
		terraform -chdir=infra "$@"
		;;
	fmt|validate|workspace|providers|get|force-unlock|version)
		# No state needed, no guard.
		terraform -chdir=infra "$@"
		;;
	"")
		printf 'usage: ./scripts/tf.sh <stack> <terraform-subcommand> [args...]\n' >&2
		exit 2
		;;
	*)
		printf '\033[1;33mwarning: passing unknown subcommand %q through without guard\033[0m\n' "$SUBCMD" >&2
		terraform -chdir=infra "$@"
		;;
esac
```

**Why a marker file instead of parsing `.terraform/terraform.tfstate`:** Terraform's local init metadata format is internal and has varied between versions (including being empty when `-backend=false` is used). A one-line marker file that we write ourselves is version-proof and trivial to reason about.

Make it executable: `chmod +x scripts/tf.sh`.

- [ ] **Step 2: Smoke-test invalid-stack refusal**

Run: `./scripts/tf.sh foo plan || echo "exit=$?"`
Expected: stderr contains `refusing: stack must be one of`, exit code 2.

- [ ] **Step 3: Smoke-test missing-init refusal**

Ensure clean state: `rm -rf infra/.terraform infra/.terraform.lock.hcl`

Run: `./scripts/tf.sh p41m0n plan || echo "exit=$?"`
Expected: stderr contains `refusing: infra/.terraform/.stack missing`, exit code 3.

- [ ] **Step 4: Smoke-test wrong-stack refusal**

Simulate an init from a different stack by writing a mismatched marker:

```bash
mkdir -p infra/.terraform
printf 'millsymills\n' > infra/.terraform/.stack
./scripts/tf.sh p41m0n plan || echo "exit=$?"
```

Expected: stderr contains `refusing: infra/.terraform initialized for stack "millsymills"`, exit code 4.

Clean up: `rm -rf infra/.terraform`

- [ ] **Step 5: Smoke-test init path (with `-backend=false` for safety)**

A real init would hit the `millsymills-terraform-state` S3 bucket, which may not exist yet. Instead dry-run the init path without a backend:

Run: `terraform -chdir=infra init -reconfigure -backend=false -input=false -backend-config=stacks/p41m0n.backend.hcl`
Expected: `Terraform has been successfully initialized!`. This exercises the backend-config merge at init time; the marker file is not written because we bypassed `scripts/tf.sh`, which is correct — the marker only records *real* inits.

- [ ] **Step 6: Commit**

```bash
git add scripts/tf.sh
git commit -m "feat(scripts): stack-aware terraform wrapper tf.sh"
```

---

## Task 12: Expose `route53_nameservers` output

The runbook needs the four Route53 NS records at flip time. Add the output to Terraform.

**Files:**
- Modify: `infra/outputs.tf`

- [ ] **Step 1: Read the existing outputs file**

Run: `cat infra/outputs.tf`

- [ ] **Step 2: Append the NS output**

Add at the end of `infra/outputs.tf`:

```terraform
output "route53_nameservers" {
  description = "The four nameservers assigned to the Route53 hosted zone. Paste these into the registrar (Squarespace for millsymills; Gandi for p41m0n) to flip delegation."
  value       = data.aws_route53_zone.site.name_servers
}
```

- [ ] **Step 3: Fmt + validate**

Run: `terraform -chdir=infra fmt -check -recursive && terraform -chdir=infra init -backend=false -input=false -reconfigure && terraform -chdir=infra validate`
Expected: all three succeed.

- [ ] **Step 4: Commit**

```bash
git add infra/outputs.tf
git commit -m "feat(infra): expose route53_nameservers output for registrar flip"
```

---

## Task 13: Write `scripts/gandi-snapshot.sh`

Dumps every rrset in a Gandi LiveDNS zone to stdout as JSON. Uses `curl` + `GANDI_API_KEY` env var — deliberately not via MCP, so rollback doesn't depend on Claude being attached.

**Files:**
- Create: `scripts/gandi-snapshot.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
#
# Dump all LiveDNS records for a Gandi-managed domain as JSON.
# Usage:
#   GANDI_API_KEY=... ./scripts/gandi-snapshot.sh <domain>
#   # typically: ... > .local/gandi-<domain>-pre-cutover.json
#
# This is the rollback source of truth for NS-flip cutovers.
# Deliberately does not use MCP — a rollback snapshot must work
# without Claude Code attached.

set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
	printf 'usage: GANDI_API_KEY=... %s <domain>\n' "$0" >&2
	exit 2
fi

if [[ -z "${GANDI_API_KEY:-}" ]]; then
	printf 'error: GANDI_API_KEY env var is required. Get one from https://admin.gandi.net/organizations → Security → Personal Access Tokens.\n' >&2
	exit 2
fi

# LiveDNS API is at https://api.gandi.net/v5/livedns/domains/<fqdn>/records
curl -fsSL \
	-H "Authorization: Bearer ${GANDI_API_KEY}" \
	-H 'Accept: application/json' \
	"https://api.gandi.net/v5/livedns/domains/${DOMAIN}/records"
```

Make it executable: `chmod +x scripts/gandi-snapshot.sh`.

- [ ] **Step 2: Smoke-test missing-arg refusal**

Run: `./scripts/gandi-snapshot.sh || echo "exit=$?"`
Expected: `usage:` message, exit 2.

- [ ] **Step 3: Smoke-test missing-token refusal**

Run: `GANDI_API_KEY= ./scripts/gandi-snapshot.sh p41m0n.com || echo "exit=$?"`
Expected: `error: GANDI_API_KEY env var is required`, exit 2.

- [ ] **Step 4: (Optional, requires a real API key) Live test against p41m0n.com**

If you have a Gandi PAT set in your shell:

Run: `./scripts/gandi-snapshot.sh p41m0n.com | python3 -m json.tool | head -20`
Expected: JSON array of rrsets matching what we saw during brainstorming (apex A → `99.67.236.111`, MX records, DKIM CNAMEs, etc.).

Skip this step if no PAT is available; the script's correctness is verified at cutover time.

- [ ] **Step 5: Commit**

```bash
git add scripts/gandi-snapshot.sh
git commit -m "feat(scripts): gandi-snapshot.sh for rollback source of truth"
```

---

## Task 14: Write `scripts/verify-p41m0n.sh`

Post-cutover verification script. Runs every check from the spec's cutover step 9. Usable against any stack via an arg, so it also works for millsymills later.

**Files:**
- Create: `scripts/verify-p41m0n.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
#
# Post-cutover verification for a site deployed via this repo's infra.
# Usage:
#   ./scripts/verify-p41m0n.sh                  # defaults to p41m0n.com
#   ./scripts/verify-p41m0n.sh <domain>         # override domain
#
# Exits 0 if every check passes. Exits non-zero on the first failure,
# with a descriptive error.

set -euo pipefail

DOMAIN="${1:-p41m0n.com}"
APEX="https://${DOMAIN}"
WWW="https://www.${DOMAIN}"

fail() {
	printf '\n\033[1;31m✗ FAIL: %s\033[0m\n' "$1" >&2
	exit 1
}

ok() {
	printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

section() {
	printf '\n\033[1;36m== %s ==\033[0m\n' "$1"
}

check_cmd() {
	local desc="$1"; shift
	if "$@" >/dev/null 2>&1; then
		ok "$desc"
	else
		fail "$desc (command: $*)"
	fi
}

section "NS delegation (multi-resolver)"
for resolver in 8.8.8.8 1.1.1.1 9.9.9.9; do
	ns_output="$(dig @"$resolver" +short NS "$DOMAIN" | sort | tr '\n' ',' || true)"
	if [[ -z "$ns_output" ]]; then
		fail "dig @${resolver} NS ${DOMAIN} returned nothing"
	fi
	if echo "$ns_output" | grep -qi 'gandi'; then
		fail "resolver ${resolver} still sees Gandi NS: ${ns_output}"
	fi
	if ! echo "$ns_output" | grep -qi 'awsdns'; then
		fail "resolver ${resolver} does not see Route53 (awsdns) NS: ${ns_output}"
	fi
	ok "@${resolver}: Route53 NS"
done

section "A + AAAA"
check_cmd "dig A ${DOMAIN}" bash -c "dig +short A ${DOMAIN} | grep -qE '^[0-9.]+\$'"
check_cmd "dig AAAA ${DOMAIN}" bash -c "dig +short AAAA ${DOMAIN} | grep -qE '^[0-9a-f:]+\$'"

section "HTTPS + security headers"
headers="$(curl -sI "$APEX/")"
echo "$headers" | grep -qi '^HTTP/.* 200' || fail "GET ${APEX}/ did not return 200"
echo "$headers" | grep -qi '^strict-transport-security:' || fail "HSTS header missing"
echo "$headers" | grep -qi '^content-security-policy:' || fail "CSP header missing"
echo "$headers" | grep -qi '^x-content-type-options: *nosniff' || fail "X-Content-Type-Options missing"
echo "$headers" | grep -qi '^referrer-policy:' || fail "Referrer-Policy missing"
ok "apex HTTPS + security headers"

www_status="$(curl -s -o /dev/null -w '%{http_code}' "$WWW/")"
[[ "$www_status" == "200" ]] || fail "GET ${WWW}/ returned ${www_status}, expected 200"
ok "www HTTPS"

section "CloudFront Function directory-index rewrite"
# /about/ is a placeholder; any multi-page route on the site works. Update
# here if the site's page structure differs.
for path in / /sitemap.xml /robots.txt; do
	code="$(curl -s -o /dev/null -w '%{http_code}' "${APEX}${path}")"
	[[ "$code" == "200" ]] || fail "GET ${APEX}${path} returned ${code}, expected 200"
done
ok "core paths 200"

section "noindex + rehearsal robots.txt"
# If DOMAIN is the rehearsal domain, we expect disallow-all. If prod, allow.
robots_body="$(curl -s "${APEX}/robots.txt")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$robots_body" | grep -qE '^User-agent: *\*' || fail "robots.txt missing User-agent: *"
	echo "$robots_body" | grep -qE '^Disallow: */' || fail "rehearsal robots.txt should Disallow: /"
	ok "rehearsal robots.txt disallow-all"
else
	echo "$robots_body" | grep -qE '^Allow: */' || fail "prod robots.txt missing Allow: /"
	ok "prod robots.txt permissive"
fi

index_html="$(curl -s "${APEX}/")"
if [[ "$DOMAIN" == "p41m0n.com" ]]; then
	echo "$index_html" | grep -q 'name="robots" content="noindex,nofollow"' || fail "rehearsal HTML missing noindex meta"
	ok "rehearsal HTML has noindex meta"
fi

section "no millsymills URL leakage"
if [[ "$DOMAIN" != "millsymills.com" ]]; then
	leaked=""
	for path in / /sitemap.xml /robots.txt; do
		if curl -s "${APEX}${path}" | grep -q 'https://millsymills\.com'; then
			leaked="${leaked}${path} "
		fi
	done
	if [[ -n "$leaked" ]]; then
		fail "production URL leakage on: ${leaked}"
	fi
	ok "no millsymills URL leakage in served content"
fi

section "email (null-MX + strict DMARC)"
mx="$(dig +short MX "$DOMAIN")"
[[ "$mx" == "0 ." ]] || fail "expected null MX (\"0 .\"), got: ${mx}"
ok "null MX published"

spf="$(dig +short TXT "$DOMAIN" | grep 'v=spf1' || true)"
echo "$spf" | grep -q -- '-all' || fail "SPF is not sender-free (-all): ${spf}"
ok "SPF -all"

dmarc="$(dig +short TXT "_dmarc.${DOMAIN}" | tr -d '"' | tr ';' '\n' || true)"
echo "$dmarc" | grep -qE 'p=reject' || fail "DMARC is not p=reject"
ok "DMARC p=reject"

printf '\n\033[1;32mALL CHECKS PASSED for %s\033[0m\n' "$DOMAIN"
```

Make it executable: `chmod +x scripts/verify-p41m0n.sh`.

- [ ] **Step 2: Smoke-test against current Gandi-served p41m0n.com (pre-cutover)**

Before the NS flip, this script should FAIL — Gandi is authoritative and serves different records. This is the expected pre-cutover state.

Run: `./scripts/verify-p41m0n.sh || echo "pre-cutover expected failure"`
Expected: fails fast on the "NS delegation" section because Gandi NS are returned, not Route53. That's correct.

(Post-cutover, this script flipping to pass is the acceptance criterion.)

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-p41m0n.sh
git commit -m "feat(scripts): verify-p41m0n.sh post-cutover verification"
```

---

## Task 15: Create `.github/workflows/deploy-rehearsal.yml`

**Files:**
- Create: `.github/workflows/deploy-rehearsal.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy (rehearsal — p41m0n.com)

# This workflow deploys the Astro site to the p41m0n.com rehearsal stack.
# Manual dispatch only — never chain off push/CI. The rehearsal stack is
# a throwaway dress rehearsal, not a production target.

on:
  workflow_dispatch:

permissions:
  contents: read
  id-token: write # required for AWS OIDC

concurrency:
  group: deploy-rehearsal
  cancel-in-progress: false

jobs:
  deploy:
    name: Build + sync to S3 + invalidate CloudFront (rehearsal)
    runs-on: ubuntu-latest

    # The `rehearsal` environment MUST have required reviewers
    # configured in the repository settings. Same required-reviewer
    # pattern as `production`, different approver list if desired.
    environment:
      name: rehearsal
      url: https://${{ vars.SITE_DOMAIN }}

    steps:
      - uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck (astro check)
        run: npm run check

      - name: Build (rehearsal env)
        env:
          SITE_URL: ${{ vars.SITE_URL }}
          NO_INDEX: 'true'
          CI: 'true'
        run: npm run build

      - name: Assert no URL leakage
        run: ./scripts/assert-no-url-leakage.sh

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Sync dist/ to S3
        run: aws s3 sync dist/ "s3://${{ vars.SITE_DOMAIN }}" --delete

      - name: Invalidate CloudFront
        run: >-
          aws cloudfront create-invalidation
          --distribution-id "${{ vars.CLOUDFRONT_DISTRIBUTION_ID }}"
          --paths "/*"
```

- [ ] **Step 2: Typecheck + syntax-check the YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-rehearsal.yml'))"`
Expected: no output, exit 0.

- [ ] **Step 3: Confirm the leakage-assert step actually runs a rehearsal build**

The workflow's "Build (rehearsal env)" step already sets `NO_INDEX=true` and a p41m0n `SITE_URL`. The subsequent `./scripts/assert-no-url-leakage.sh` re-runs `npm run build` with the same env — this is intentional double-coverage (the script has its own env setup, the workflow has its own). Verify by reading the workflow back: both env blocks set `NO_INDEX=true` and a non-millsymills `SITE_URL`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-rehearsal.yml
git commit -m "feat(ci): deploy-rehearsal.yml workflow for p41m0n stack"
```

---

## Task 16: Update `CLAUDE.md` migration runbook

The runbook's current "State bucket" step says "Uncomment the backend block" — that's now wrong. Also add TTL scope and honest rollback framing.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite the state-bucket step**

Find the step in the "Migration runbook (Squarespace → AWS)" section that reads:

```markdown
1. **State bucket.** Create the S3 bucket for Terraform state (default name `millsymills-terraform-state`) in the AWS console — versioning on, SSE-S3 on, public access blocked. Uncomment the `backend "s3"` block in `infra/main.tf`.
```

Replace with:

```markdown
1. **State bucket.** Create the S3 bucket for Terraform state (default name `millsymills-terraform-state`) in the AWS console — versioning on, SSE-S3 on, public access blocked. The `backend "s3" {}` block in `infra/main.tf` is already activated as an empty block; all fields (bucket, key, region, encrypt, use_lockfile) are supplied per-stack via `infra/stacks/<stack>.backend.hcl` at `terraform init` time.
```

- [ ] **Step 2: Replace the "First apply" step with the tf.sh form**

Find:

```markdown
4. **First apply.** `cd infra && terraform init && terraform apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy.
```

Replace with:

```markdown
4. **First apply.** From the repo root: `./scripts/tf.sh millsymills init` then `./scripts/tf.sh millsymills apply`. Creates S3 buckets, CloudFront, ACM cert (DNS-validated via Route53), IAM deploy role, email DNS records, etc. Takes ~15–20 min mostly waiting on CloudFront to deploy. See `infra/stacks/` for the per-stack config; `./scripts/tf.sh` is the stack-aware wrapper and refuses to touch the wrong state by mistake.
```

- [ ] **Step 3: Add a note about the rehearsal and TTL scope**

Directly after step 10 ("Decommission Squarespace"), add a new section:

```markdown
## Dress rehearsal on p41m0n.com

Before running the migration above on millsymills.com, the same runbook is rehearsed end-to-end against `p41m0n.com`. See `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md` for the plan. Key lessons the rehearsal locks in for the real cutover:

- **Parent-zone delegation TTL governs NS rollback**, not record TTLs. A bad NS flip takes up to ~48h to fully roll back for `.com` — plan to fix-forward rather than flip-back. Validate exhaustively before the real flip.
- Run `./scripts/tf.sh p41m0n ...` for the rehearsal stack, `./scripts/tf.sh millsymills ...` for the real one. Never pass a stack name the wrapper doesn't recognize.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update runbook for per-stack backend config + TTL honesty"
```

---

## Task 17: Wire `tf.sh` refusal checks into `scripts/ci-local.sh`

Make the wrapper's stack-enforcement a CI-blocker. Prevents regressions where someone silently disables the guards.

**Files:**
- Modify: `scripts/ci-local.sh`

- [ ] **Step 1: Add a new section to the script**

Insert before the existing `section "terraform: fmt"` line:

```bash
section "scripts: tf.sh refusal checks"
# Invalid stack name must exit 2.
if ./scripts/tf.sh definitely-not-a-stack plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh accepted an invalid stack name\033[0m\n' >&2
	exit 1
fi
# Missing marker (no init yet) must exit 3.
rm -rf infra/.terraform
if ./scripts/tf.sh p41m0n plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch missing init\033[0m\n' >&2
	exit 1
fi
# Wrong-stack marker must exit 4.
mkdir -p infra/.terraform
printf 'millsymills\n' > infra/.terraform/.stack
if ./scripts/tf.sh p41m0n plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch wrong-stack marker\033[0m\n' >&2
	exit 1
fi
rm -rf infra/.terraform
ok "tf.sh refuses invalid stack + missing init + wrong-stack marker"
```

- [ ] **Step 2: Run ci-local.sh end-to-end**

Run: `./scripts/ci-local.sh`
Expected: all sections pass, final `all CI checks passed locally`.

- [ ] **Step 3: Commit**

```bash
git add scripts/ci-local.sh
git commit -m "test(ci): add tf.sh refusal checks to ci-local"
```

---

## Task 18: Final cross-file integration check

Re-run the full CI locally against HEAD. This is the go/no-go for codebase work.

**Files:** none modified; verification only.

- [ ] **Step 1: Clean build + full ci-local**

Run: `rm -rf dist node_modules/.cache infra/.terraform && ./scripts/ci-local.sh`
Expected: every section passes.

- [ ] **Step 2: Confirm both build modes produce the expected output shape**

```bash
rm -rf dist && SITE_URL=https://millsymills.com npm run build
grep -c 'https://millsymills.com' dist/sitemap.xml   # expect > 0
grep -c 'Disallow: /' dist/robots.txt                 # expect 1 (the /super-secret/ one)
```

```bash
rm -rf dist && SITE_URL=https://p41m0n.com NO_INDEX=true npm run build
grep -c 'https://millsymills.com' dist/sitemap.xml   # expect 0
grep -c 'https://p41m0n.com' dist/sitemap.xml         # expect > 0
grep -c 'Disallow: /' dist/robots.txt                 # expect 1 (global disallow)
grep -l 'noindex,nofollow' dist/*.html                # expect all top-level HTMLs
```

Expected: both build modes produce the right values for each grep.

- [ ] **Step 3: If anything above fails, return to the offending task**

No commit — this is a verification gate, not a code change.

---

## Operational runbook (post-implementation)

With all 18 tasks done, the *codebase* is ready. The rehearsal itself is then run as follows — these are *operational* steps, not code changes:

**Pre-flight (one-time setup, human-in-the-loop):**

1. Confirm `millsymills-terraform-state` S3 bucket exists (versioning + SSE-S3 + public access blocked). If not, create per `CLAUDE.md` step 1.
2. In the AWS console, create a Route53 public hosted zone for `p41m0n.com`. Do NOT change Gandi nameservers yet.
3. Run `./scripts/tf.sh p41m0n init && ./scripts/tf.sh p41m0n apply`. Wait for it (~15–20 min).
4. Note `./scripts/tf.sh p41m0n output github_deploy_role_arn` and `./scripts/tf.sh p41m0n output cloudfront_distribution_id` — you'll put these in GitHub env vars.
5. In GitHub repo settings → Environments → create `rehearsal`, add yourself as a required reviewer.
6. In GitHub repo settings → Variables → under the `rehearsal` environment, set: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION=us-east-1`, `SITE_DOMAIN=p41m0n.com`, `SITE_URL=https://p41m0n.com`, `CLOUDFRONT_DISTRIBUTION_ID`.

**Pre-cutover validation (CloudFront-only, no DNS touched):**

7. Trigger `deploy-rehearsal.yml` from the Actions tab. Approve the required-reviewer gate. Confirm it completes successfully.
8. Hit `https://<dist-id>.cloudfront.net/` directly. Click through pages. Confirm CloudFront Function rewrites work, `robots.txt` is disallow-all, canonical/JSON-LD/sitemap all reference `p41m0n.com` only.

**Cutover — point of no return:**

9. `GANDI_API_KEY=... ./scripts/gandi-snapshot.sh p41m0n.com > .local/gandi-p41m0n-pre-cutover.json`.
10. In Gandi LiveDNS, lower apex A + `www` CNAME TTLs to 300. Wait 3h.
11. In Gandi's registrar UI for `p41m0n.com` → Nameservers, paste the four NS records from `./scripts/tf.sh p41m0n output route53_nameservers`.

**Post-cutover verification:**

12. Wait 30 minutes, then `./scripts/verify-p41m0n.sh p41m0n.com`. Fix anything that fails (fix-forward, not flip-back).

**Run duration:** 3–7 days. Watch for async failures, indexing leaks, header regressions.

**Tear-down:** per the spec's tear-down section — flip NS back at the Gandi registrar, wait 48h for delegation cache to decay, then `./scripts/tf.sh p41m0n destroy`. Delete the Route53 zone in the AWS console.
