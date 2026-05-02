# Phase 5c — PR 3: /privacy/ page (#43) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/privacy/` page that honestly declares the site's data posture (no analytics, no cookies, no third-party scripts), with a commit-SHA attestation footer proving which version the visitor got. Self-host the two Google-fonts typefaces so the page's "zero third-party requests" claim is literally true. Add a `privacy` terminal command.

**Architecture:** New `Privacy.astro` desktop app + `privacy-copy.ts` data module. One new `apps.ts` entry auto-gets the desktop icon, mobile slot, `/privacy/` route, and OG metadata. Google Fonts migrate from CDN to local WOFF2 files; CSP tightens to `'self'` for font + style sources. One new terminal command.

**Tech Stack:** Astro 6, TypeScript, Terraform (CSP tightening), CSS.

**Spec:** `docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md` — section *#43 — `/privacy/` page*.
**Issue:** [#43](https://github.com/millsmillsymills/millsymills.com/issues/43)
**Branch:** `phase-5c/43-privacy`, cut from `main` after PR 1 merges.
**Depends on:** PR 1 (`PUBLIC_GIT_SHA`) merged.
**Depends on input:** none.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/privacy-copy.ts` | create | Prose content broken into named sections |
| `src/components/desktop/apps/Privacy.astro` | create | Layout + rendering; pulls prose from `privacy-copy.ts` + `PUBLIC_GIT_SHA` |
| `src/data/apps.ts` | modify | Add `privacy` entry after `mail` |
| `src/scripts/terminal/commands/basic.ts` | modify | Register `privacy` command |
| `public/fonts/PressStart2P-Regular.woff2` | create | Self-hosted Press Start 2P |
| `public/fonts/VT323-Regular.woff2` | create | Self-hosted VT323 |
| `src/styles/desktop.css` | modify | Add `@font-face` for the two new fonts |
| `src/layouts/DesktopLayout.astro` | modify | Remove Google Fonts `<link>` + preconnects |
| `infra/cloudfront.tf` | modify | Tighten CSP: drop `fonts.googleapis.com` from `style-src`, drop `fonts.gstatic.com` from `font-src` |

No Astro test file (repo convention). Terraform plan is the lint.

---

## Notes for the implementer

- **CloudFront log retention is 90 days, not 30.** Existing Terraform: `infra/s3.tf:127-144` sets `expiration.days = 90` for the logs bucket. The spec hinted 30. **Match reality — the privacy page text says 90 days.** Do NOT change the Terraform retention as part of this PR (different scope).
- Existing self-hosted fonts (`tahoma.ttf`, `framdit.ttf`) live in `public/fonts/` already. Adding two WOFF2 files there matches the pattern.
- `Press Start 2P` and `VT323` are OFL-licensed via Google Fonts; WOFF2 files can be downloaded from the Google Fonts API directly or from [fonts.google.com](https://fonts.google.com) "Download family" → pick WOFF2.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on the PR branch**

```bash
git branch --show-current
```

Expected: `phase-5c/43-privacy`.

If not: `git fetch origin && git checkout -b phase-5c/43-privacy origin/main`.

- [ ] **Step 2: Confirm PR 1 has landed**

```bash
git log --oneline origin/main | grep -E "PUBLIC_GIT_SHA|virtual-fs" | head -2
```

Expected: at least one line — this PR uses `import.meta.env.PUBLIC_GIT_SHA` from PR 1. If missing, stop.

- [ ] **Step 3: Baseline clean**

```bash
git status --short
npm run check
```

Expected: empty status; 0 errors on check.

---

## Task 1: Create `src/data/privacy-copy.ts`

Prose-only module. Component does layout; this does copy.

**Files:**
- Create: `src/data/privacy-copy.ts`

- [ ] **Step 1: Write the module**

Create `src/data/privacy-copy.ts`:

```ts
/*
 * Privacy-page copy. Broken into named sections so Privacy.astro
 * can lay out without inlining paragraphs.
 *
 * Voice: lowercase, terse, Y2K-pink. Keep claims accurate — the page
 * itself is the credibility; shipping untrue statements here is worse
 * than shipping no page at all.
 */

export interface LocalStorageKey {
	key: string;
	purpose: string;
}

export const localStorageKeys: LocalStorageKey[] = [
	{ key: 'mills.desktop.v1', purpose: 'open windows, positions, last-open app' },
	{ key: 'mills.flags.v1', purpose: 'captured CTF flags' },
	{ key: 'mills.mobile.v1', purpose: 'mobile-shell state' },
	{ key: 'mills.boot.played', purpose: '"played boot sequence already" flag' },
];

export const copy = {
	intro: 'this site does not track you. the rest of this page is a more specific statement of that fact, so you can check the receipts.',
	whatWeCollect: {
		heading: 'what we collect',
		body: 'nothing. no analytics, no cookies, no fingerprinting, no tag managers, no third-party scripts. the site is static html + css + a little javascript, served from cloudfront, built from a public github repo.',
	},
	whatsOnTheWire: {
		heading: "what's on the wire",
		body: 'when you load a page: html, css, images, the two self-hosted fonts (Press Start 2P, VT323), and the javascript bundle for the desktop ui. that\'s it. zero third-party fetches. no google fonts, no cdn libraries, no analytics beacons.',
	},
	localStorage: {
		heading: 'localStorage',
		preamble: 'a handful of keys keep your ui state between visits. everything is client-side, never sent anywhere:',
		// keys rendered from localStorageKeys above
	},
	serverLogs: {
		heading: 'server logs',
		body: 'cloudfront keeps standard access logs (url, ip, user-agent, timestamp, status code) in an s3 bucket we own. they auto-expire after 90 days. no additional logging, no processing, no profile-building. the logs exist so outages are debuggable.',
	},
	botsAndAi: {
		heading: 'bots / AI',
		body: 'the site publishes `/robots.txt` and `/.well-known/ai.txt` (cloudflare content-signals). both describe our stance for crawlers and ai training. respect them or don\'t — we\'re not going to litigate either way.',
	},
	licenseAndSource: {
		heading: 'license + source',
		body: 'the site\'s source is MIT-licensed on github. if any of this reads sketchy, read the source. fork it, run your own.',
		repoUrl: 'https://github.com/millsmillsymills/millsymills.com',
	},
	attestationPrefix: 'served from commit',
};
```

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 2: Create `src/components/desktop/apps/Privacy.astro`

**Files:**
- Create: `src/components/desktop/apps/Privacy.astro`

- [ ] **Step 1: Write the component**

Pattern-match the existing `About.astro` / `Mail.astro` files for imports, layout class names, and style scoping. Create `src/components/desktop/apps/Privacy.astro`:

```astro
---
import { copy, localStorageKeys } from '../../../data/privacy-copy';

const gitShaFull = import.meta.env.PUBLIC_GIT_SHA ?? 'unknown';
const gitShaShort = gitShaFull.slice(0, 7);
const repoUrl = copy.licenseAndSource.repoUrl;
---

<article class="privacy">
	<p class="lede">{copy.intro}</p>

	<section>
		<h3>{copy.whatWeCollect.heading}</h3>
		<p>{copy.whatWeCollect.body}</p>
	</section>

	<section>
		<h3>{copy.whatsOnTheWire.heading}</h3>
		<p>{copy.whatsOnTheWire.body}</p>
	</section>

	<section>
		<h3>{copy.localStorage.heading}</h3>
		<p>{copy.localStorage.preamble}</p>
		<dl class="ls-keys">
			{localStorageKeys.map((k) => (
				<>
					<dt><code>{k.key}</code></dt>
					<dd>{k.purpose}</dd>
				</>
			))}
		</dl>
	</section>

	<section>
		<h3>{copy.serverLogs.heading}</h3>
		<p>{copy.serverLogs.body}</p>
	</section>

	<section>
		<h3>{copy.botsAndAi.heading}</h3>
		<p>{copy.botsAndAi.body}</p>
	</section>

	<section>
		<h3>{copy.licenseAndSource.heading}</h3>
		<p>
			{copy.licenseAndSource.body}{' '}
			<a href={repoUrl} rel="noopener">{repoUrl}</a>
		</p>
	</section>

	<footer class="attestation">
		<code>{copy.attestationPrefix} {gitShaShort}</code>
		{' '}
		<small>(full: <code>{gitShaFull}</code>)</small>
	</footer>
</article>

<style>
	.privacy {
		padding: 1rem 1.25rem;
		color: var(--ink);
		font-family: var(--font-xp-ui, system-ui, sans-serif);
		line-height: 1.5;
	}
	.privacy .lede {
		font-style: italic;
		color: var(--ink-soft);
		border-left: 3px solid var(--pink-400);
		padding-left: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.privacy section {
		margin-bottom: 1rem;
	}
	.privacy h3 {
		font-family: var(--font-screen, monospace);
		font-size: 1.1rem;
		color: var(--pink-600);
		margin: 0 0 0.35rem;
		text-transform: lowercase;
	}
	.privacy p,
	.privacy dd {
		margin: 0 0 0.5rem;
	}
	.privacy .ls-keys {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.15rem 0.75rem;
		margin: 0.4rem 0;
	}
	.privacy .ls-keys dt code {
		font-size: 0.85rem;
	}
	.privacy .ls-keys dd {
		margin: 0;
		color: var(--ink-soft);
	}
	.privacy .attestation {
		margin-top: 1.5rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--pink-300);
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.privacy .attestation code {
		background: var(--pink-50);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	.privacy a {
		color: var(--pink-600);
	}
</style>
```

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors. The `import.meta.env.PUBLIC_GIT_SHA` type comes from `src/env.d.ts` created in PR 1.

---

## Task 3: Register the app in `apps.ts`

**Files:**
- Modify: `src/data/apps.ts`

- [ ] **Step 1: Add the entry**

Open `src/data/apps.ts`. Find the existing `mail` entry in the `apps` array. Insert a new entry after it:

```ts
	{
		id: 'privacy',
		label: 'privacy',
		glyph: '🔒',
		title: 'privacy.txt',
		ogDescription: 'the site\'s data posture — no tracking, no cookies, no third-party scripts. a privacy page you can verify.',
		x: 200,
		y: 140,
		width: 620,
		height: 520,
	},
```

(Drop `iconUrl` — not using an icon-pack image here. If you want, pick one from `public/images/icons/web10/` and add `iconUrl: '/images/icons/web10/<file>.png'`, but default is emoji glyph.)

- [ ] **Step 2: Wire the component into the desktop**

The dynamic `/[app].astro` route auto-discovers all apps from `apps.ts`, but the Desktop.astro component has per-app rendering (or may use a component registry). Confirm which:

```bash
grep -n -E "Privacy|About|Mail|findApp" src/components/desktop/Desktop.astro | head -20
```

Look at how existing apps are rendered. Two likely patterns:
- **Pattern A:** A switch/if ladder mapping `id` → component import. Add a `privacy` case importing `Privacy.astro`.
- **Pattern B:** Dynamic component import via map. Add `'privacy': Privacy` to the map.

Follow the pattern actually used. Do the same check for `MobileFallback.astro` if it also has per-app rendering.

- [ ] **Step 3: Verify type-check**

```bash
npm run check
```

Expected: 0 errors. Any errors here indicate the Desktop.astro wire-up is wrong — fix based on the pattern used by existing apps.

- [ ] **Step 4: Smoke**

```bash
npm run dev
```

- Open `http://localhost:4321/` — confirm `privacy` icon shows up on the desktop
- Double-click the icon — confirm the window opens with the prose sections visible
- Confirm the attestation footer at the bottom shows the git SHA
- Open `http://localhost:4321/privacy/` directly — confirm it routes and shows the same app focused
- Open mobile viewport (Chrome devtools iPhone 13) — confirm privacy launcher appears and opens

Kill dev server.

- [ ] **Step 5: Commit Tasks 1-3**

```bash
git add src/data/privacy-copy.ts src/components/desktop/apps/Privacy.astro src/data/apps.ts src/components/desktop/Desktop.astro src/components/desktop/MobileFallback.astro
git status --short
```

Expected: five or fewer files staged — ones you actually modified. `git commit`:

```bash
git commit -m "$(cat <<'EOF'
feat(apps): /privacy/ page with commit-SHA attestation (#43)

New desktop app explicitly declaring the site's data posture. Prose lives
in src/data/privacy-copy.ts; the component pulls import.meta.env.PUBLIC_GIT_SHA
(from PR 1) for the attestation footer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Self-host `Press Start 2P` and `VT323`

The privacy page's "zero third-party requests" claim is currently false — the layout pulls fonts from Google. Fix the claim by making it true.

**Files:**
- Create: `public/fonts/PressStart2P-Regular.woff2`
- Create: `public/fonts/VT323-Regular.woff2`
- Modify: `src/styles/desktop.css`
- Modify: `src/layouts/DesktopLayout.astro`

- [ ] **Step 1: Download the WOFF2 files**

`Press Start 2P` and `VT323` are OFL-licensed. Resolve the current versioned WOFF2 URL via the Google Fonts CSS API instead of pinning a versioned `fonts.gstatic.com` path that rotates upstream:

```bash
set -euo pipefail

# Resolve the current versioned WOFF2 URL via Google's CSS API and
# download it. Implementation notes for the curious maintainer:
#
# - `Mozilla/5.0` is the minimum UA prefix Google honors for WOFF2
#   delivery; a bare `curl/X.Y.Z` UA gets legacy .ttf/.eot variants.
# - Regex excludes `"`, `'`, `)`, and space so it survives whether
#   Google emits `url(https://...)`, `url("https://...")`, or
#   `url('https://...')`.
# - `|| true` prevents `set -e -o pipefail` from killing the script on
#   a zero-match grep — `test -n` below is the authoritative check.
# - `curl -f` fails on HTTP error so a 4xx can't write an HTML error
#   body to the .woff2 path; `test -s` then rejects 0-byte responses.
fetch_woff2() {
  local family=$1 out=$2 url
  url=$(curl -sL -A 'Mozilla/5.0' "https://fonts.googleapis.com/css2?family=$family" \
    | grep -oE "https://[^\")' ]+\\.woff2" | head -1 || true)
  test -n "$url"
  curl -fL -o "$out" "$url"
  test -s "$out"
}

fetch_woff2 'Press+Start+2P' public/fonts/PressStart2P-Regular.woff2
fetch_woff2 'VT323' public/fonts/VT323-Regular.woff2
```

If the CSS API ever changes shape, fallback: use [`google-webfonts-helper`](https://gwfh.mranftl.com/fonts) — pick the family + weight, download the WOFF2 directly. The `fonts.google.com` "Download family" zip is not a reliable fallback because it has historically shipped only `.ttf`; verify it includes WOFF2 before trusting it.

- [ ] **Step 2: Verify files exist and are non-empty**

```bash
ls -l public/fonts/PressStart2P-Regular.woff2 public/fonts/VT323-Regular.woff2
```

Expected: both files present, >5KB each.

- [ ] **Step 3: Add `@font-face` rules to `desktop.css`**

Open `src/styles/desktop.css`. After the existing `Franklin Gothic ITC` `@font-face` block (around line 29), add:

```css
@font-face {
	font-family: 'Press Start 2P';
	src: url('/fonts/PressStart2P-Regular.woff2') format('woff2');
	font-weight: 400;
	font-style: normal;
	font-display: swap;
}

@font-face {
	font-family: 'VT323';
	src: url('/fonts/VT323-Regular.woff2') format('woff2');
	font-weight: 400;
	font-style: normal;
	font-display: swap;
}
```

(The existing `:root` tokens already reference `'Press Start 2P'` and `'VT323'` by name — no change needed there. Those tokens just work once the `@font-face` is in place.)

- [ ] **Step 4: Remove Google Fonts `<link>` from `DesktopLayout.astro`**

Open `src/layouts/DesktopLayout.astro`. Find the three lines at 75-80:

```astro
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
		<link
			rel="stylesheet"
			href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"
		/>
```

**Delete all three** (the two preconnects and the stylesheet link). Leave everything around them unchanged.

- [ ] **Step 5: Verify type-check + build**

```bash
npm run check
SITE_URL=https://millsymills.com npm run build
```

Expected: 0 errors on check; build exits 0.

- [ ] **Step 6: Confirm no external font fetch remains**

Search for any stray Google Fonts reference:

```bash
grep -rn "fonts.googleapis\|fonts.gstatic" src/ public/ 2>&1 | grep -v "node_modules\|dist\|\.astro/"
```

Expected: empty output. If any hits remain, delete those references.

- [ ] **Step 7: Smoke — fonts render**

```bash
npm run preview &
PREVIEW_PID=$!
sleep 3
curl -sS http://localhost:4321/ | grep -E "PressStart2P|VT323|fonts.googleapis|fonts.gstatic" | head -10
kill $PREVIEW_PID
```

Expected output:
- Hits mentioning `/fonts/PressStart2P-Regular.woff2` and `/fonts/VT323-Regular.woff2` inside the CSS (maybe via the bundled CSS link — could be absent if CSS is fully hashed)
- **Zero hits** for `fonts.googleapis` or `fonts.gstatic`

Also open `http://localhost:4321/` in a browser and confirm the pixel/screen fonts render (they did before — just shouldn't look different now).

- [ ] **Step 8: Commit**

```bash
git add public/fonts/PressStart2P-Regular.woff2 public/fonts/VT323-Regular.woff2 src/styles/desktop.css src/layouts/DesktopLayout.astro
git commit -m "$(cat <<'EOF'
feat(fonts): self-host Press Start 2P + VT323 (#43 prep)

Drops the two preconnects + stylesheet link to fonts.googleapis.com in
favor of two WOFF2 files under public/fonts/. Zero third-party font
fetches — makes the privacy page's "no third-party scripts" claim
literally true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tighten CSP in Terraform

Now that no Google Fonts fetches happen, drop them from the CSP.

**Files:**
- Modify: `infra/cloudfront.tf` (line 36, the `content_security_policy` string)

- [ ] **Step 1: Update the CSP**

Open `infra/cloudfront.tf`. Find line 36 (the `content_security_policy` assignment). It currently reads:

```hcl
content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
```

Change to:

```hcl
content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
```

Specifically: remove `https://fonts.googleapis.com` from `style-src` and remove `https://fonts.gstatic.com` from `font-src`. Everything else stays identical.

- [ ] **Step 2: Terraform format + validate**

```bash
./scripts/tf.sh millsymills init -backend=false -reconfigure 2>&1 | tail -5
terraform -chdir=infra fmt
terraform -chdir=infra validate
```

Expected: `Success! The configuration is valid.`

If `./scripts/tf.sh` requires a real backend, try:
```bash
terraform -chdir=infra init -backend=false -upgrade 2>&1 | tail -5
terraform -chdir=infra fmt
terraform -chdir=infra validate
```

- [ ] **Step 3: Terraform plan (dry-run, don't apply)**

```bash
./scripts/tf.sh millsymills plan -detailed-exitcode 2>&1 | tail -40
```

Expected: the plan shows exactly one change — the CSP string updated on the CloudFront response-headers-policy. Exit code 2 means "changes present" (expected); exit 0 means "no changes" (problem); exit 1 means error.

If the plan shows unrelated drift (e.g. Terraform state lagging), investigate but don't fix as part of this PR.

- [ ] **Step 4: Commit**

```bash
git add infra/cloudfront.tf
git commit -m "$(cat <<'EOF'
infra(cloudfront): drop Google Fonts from CSP (#43)

Now that fonts are self-hosted (previous commit), tighten style-src and
font-src to 'self'. Reduces attack surface, matches what's actually served.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add the `privacy` terminal command

**Files:**
- Modify: `src/scripts/terminal/commands/basic.ts`

- [ ] **Step 1: Register the command**

Inside the existing `register(...)` call in `basic.ts`, add:

```ts
	{
		name: 'privacy',
		summary: 'print the site\'s privacy posture',
		handler: ({ out }) => {
			out('tl;dr — no tracking, no cookies, no third-party scripts.', 't-dim');
			out('');
			out('  - localStorage only (window positions, flag progress, boot flag)');
			out('  - CloudFront access logs — 90d retention, non-PII');
			out('  - MIT licensed, source on GitHub');
			out('');
			out('full policy:  https://millsymills.com/privacy/');
		},
	},
```

- [ ] **Step 2: Type-check + smoke**

```bash
npm run check
```

Then:

```bash
npm run dev
```

Open the terminal, run `help` — confirm `privacy` listed; run `privacy` — confirm the TL;DR prints.

Kill dev server.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/terminal/commands/basic.ts
git commit -m "$(cat <<'EOF'
feat(terminal): add privacy command with TL;DR (#43)

Five-line TL;DR of the /privacy/ page, with a link to the full policy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification

**Files:** none.

- [ ] **Step 1: Clean tree, check clean, build clean**

```bash
git status --short
npm run check
SITE_URL=https://millsymills.com npm run build
```

Expected: empty status; 0 errors; build succeeds.

- [ ] **Step 2: Run the assert-no-X-leakage scripts** (the repo has these for cross-stack safety)

```bash
./scripts/assert-no-url-leakage.sh
./scripts/assert-no-rehearsal-leakage.sh
```

Expected: both exit 0 (or warn in a way consistent with `main`).

- [ ] **Step 3: Confirm the git SHA lands in built HTML**

```bash
grep -r "served from commit" dist/ 2>&1 | head -3
```

Expected: at least one match (in `dist/privacy/index.html`), followed by a real SHA.

- [ ] **Step 4: Confirm no Google Fonts references in built output**

```bash
grep -r "fonts.googleapis\|fonts.gstatic" dist/ 2>&1 | head -5
```

Expected: empty output. Any hit is a failure — find the source and fix.

- [ ] **Step 5: Review commits on branch**

```bash
git log --oneline origin/main..HEAD
```

Expected (newest first):
```
<sha> feat(terminal): add privacy command with TL;DR (#43)
<sha> infra(cloudfront): drop Google Fonts from CSP (#43)
<sha> feat(fonts): self-host Press Start 2P + VT323 (#43 prep)
<sha> feat(apps): /privacy/ page with commit-SHA attestation (#43)
```

Four commits.

---

## Task 8: Push + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin phase-5c/43-privacy
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: /privacy/ page + self-hosted fonts (#43)" --body "$(cat <<'EOF'
Closes #43.

## Summary
- New \`Privacy.astro\` desktop app declaring the site's data posture (no analytics, no cookies, no third-party scripts)
- Attestation footer shows the commit SHA the page was built from (from \`PUBLIC_GIT_SHA\` via PR 1)
- Self-hosts Press Start 2P + VT323 (two WOFF2 files in \`public/fonts/\`), removing Google Fonts preconnects + stylesheet link
- Tightens CSP in CloudFront: \`style-src 'self' 'unsafe-inline'\`, \`font-src 'self' data:\` — no more \`fonts.googleapis.com\` or \`fonts.gstatic.com\` exceptions
- New \`privacy\` terminal command prints a TL;DR

## Test plan
- [ ] \`npm run check\` clean
- [ ] \`npm run build\` clean, \`dist/privacy/index.html\` exists
- [ ] Privacy page renders on desktop + mobile; attestation footer shows real SHA
- [ ] \`grep -r fonts.googleapis dist/\` → empty
- [ ] \`terraform plan\` shows exactly one diff: CSP string
- [ ] Terminal: \`privacy\` prints TL;DR
- [ ] \`./scripts/assert-no-url-leakage.sh\` and \`assert-no-rehearsal-leakage.sh\` pass

## Notes for reviewer
- CloudFront log retention is documented as 90 days in the page (matches \`infra/s3.tf:137\`). Spec initially assumed 30 — decided to match reality over aspirational copy.
- PR includes a small Terraform diff for the CSP tightening. Review the \`aws_cloudfront_response_headers_policy\` resource touched in \`infra/cloudfront.tf:36\`.

Spec: \`docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md\`
Depends on: #<PR-1 number> merged first

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Definition of done

- All 8 tasks' checkboxes checked
- CI passes
- `/privacy/` route renders the prose + attestation footer
- Zero Google Fonts requests on any page
- `terraform plan` applied post-merge shows exactly the CSP update
- `privacy` terminal command prints the TL;DR
