# Phase 5c — PR 4: /incidents/ wall (#44) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/incidents/` — a scrollable, severity-coded card timeline of notable security incidents and CVEs mills has personally responded to. Framed as structured war-stories, not resume bullets.

**Architecture:** New `Incidents.astro` desktop app + `src/data/incidents.ts` typed data module. Reuses the `apps.ts` pattern (new entry → auto-desktop-icon + mobile slot + route + OG). New `incidents` terminal command.

**Tech Stack:** Astro 6, TypeScript, CSS.

**Spec:** `docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md` — section *#44 — `/incidents/` wall*.
**Issue:** [#44](https://github.com/millsmillsymills/millsymills.com/issues/44)
**Branch:** `phase-5c/44-incidents`, cut from `main` after PR 1 merges.
**Depends on:** PR 1 merged.
**Depends on input:** C — NDA-vetted incident list from mills. See *Input C handling* below.

---

## Input C handling

This PR needs mills to hand over a list of at least 5 incidents, with fields per entry:

- `year` (number)
- `severity` (one of `info | low | med | high | critical`)
- `cve` (optional string, e.g. `"CVE-2022-12345"`)
- `title` (short, e.g. `"Zoom RCE 0-day"`)
- `annotation` (one paragraph, site voice)
- `link` (optional `{ label, href }`)

**Do not invent incidents.** If mills hasn't handed over the list, stop this PR and ping. A partial list is fine as long as the shipped list has ≥5 entries (issue #44 acceptance criteria).

**Starting candidates from `src/data/profile.ts`** (resume war stories — confirm with mills which are NDA-safe):
- Zoom RCE 0-day (custom mitigation 8h before vendor)
- ELUSIVE COMET intel-sharing + Zoom remote-control hardening
- Hardware theft solved via MAC correlation
- Rogue client keylogger + firewall-credential social-engineering
- Hurricane Irma emergency exfil
- Poweliks + Cryptolocker mitigations under FINRA/SEC

The tasks below assume mills has provided a final list — substitute real content wherever you see `<<< INCIDENT LIST FROM mills >>>`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/incidents.ts` | create | `Incident` type + the sorted `incidents` list |
| `src/components/desktop/apps/Incidents.astro` | create | Card timeline layout + scoped styles |
| `src/data/apps.ts` | modify | Add `incidents` entry |
| `src/components/desktop/Desktop.astro` | modify | Wire `Incidents` component (whichever pattern existing apps use) |
| `src/components/desktop/MobileFallback.astro` | modify | Wire into mobile shell if that file has per-app rendering |
| `src/scripts/terminal/commands/basic.ts` | modify | Register `incidents` command with optional year filter |

No tests.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on the PR branch**

```bash
git branch --show-current
```

Expected: `phase-5c/44-incidents`.

If not: `git fetch origin && git checkout -b phase-5c/44-incidents origin/main`.

- [ ] **Step 2: Confirm PR 1 landed**

```bash
git log --oneline origin/main | grep -E "virtual-fs|PUBLIC_GIT_SHA" | head -2
```

Expected: ≥1 match.

- [ ] **Step 3: Baseline clean**

```bash
git status --short
npm run check
```

Expected: empty status, 0 errors.

- [ ] **Step 4: Confirm incident list from mills is ready**

Read the list mills supplied. Count entries. If <5, **stop** — doesn't meet the acceptance criteria. If NDA concerns on any entry are unresolved, resolve before continuing.

---

## Task 1: Create `src/data/incidents.ts`

**Files:**
- Create: `src/data/incidents.ts`

- [ ] **Step 1: Write the module skeleton**

Create `src/data/incidents.ts` with this structure, then populate the list from input C:

```ts
/*
 * Incident wall. Real CVE / IR stories mills has personally worked.
 *
 * NDA-safe content only. Voice is terse, lowercase, Y2K-pink — annotations
 * read like debriefs, not resume bullets. Sort newest first; the component
 * renders in array order.
 */

export type Severity = 'info' | 'low' | 'med' | 'high' | 'critical';

export interface Incident {
	year: number;
	severity: Severity;
	cve?: string;
	title: string;
	annotation: string;
	link?: { label: string; href: string };
}

export const incidents: Incident[] = [
	// <<< REPLACE with list from input C, sorted newest-first >>>
	// Template for one entry:
	// {
	// 	year: 2024,
	// 	severity: 'critical',
	// 	cve: 'CVE-2024-12345',
	// 	title: 'short handle',
	// 	annotation: 'one paragraph, terse, what happened + what we did + what it taught us.',
	// 	link: { label: 'full writeup', href: 'https://...' },
	// },
];
```

Replace the `<<< ... >>>` comment with the real list. Ensure:
- Array is sorted newest-first (highest year at index 0)
- Every entry has `year`, `severity`, `title`, `annotation`
- `cve` omitted (not empty string) when no CVE applies
- `link` omitted when no external writeup
- Annotations stay one paragraph each (2-4 sentences max)

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors. If a missing field or typo in severity string, fix.

- [ ] **Step 3: Confirm ≥5 entries**

```bash
node -e "import('./src/data/incidents.ts').then(m => console.log(m.incidents.length))" 2>&1 | tail -1
```

If this node invocation doesn't work (TS can't be imported directly), grep instead:

```bash
grep -c "^\s*{$" src/data/incidents.ts
```

Expected: 5 or more.

---

## Task 2: Create `src/components/desktop/apps/Incidents.astro`

**Files:**
- Create: `src/components/desktop/apps/Incidents.astro`

- [ ] **Step 1: Write the component**

```astro
---
import { incidents, type Severity } from '../../../data/incidents';

const severityLabel: Record<Severity, string> = {
	info: 'info',
	low: 'low',
	med: 'med',
	high: 'high',
	critical: 'crit',
};
---

<article class="incidents">
	<header class="hex-chrome">
		<pre class="hex"
>{`0x00000000  69 6e 63 69 64 65 6e 74  73 2e 6c 6f 67 20 2d 2d   incidents.log --
0x00000010  20 76 69 65 77 65 72 20  20 20 20 20 20 20 20 20    viewer         
0x00000020  6e 65 77 65 73 74 20 66  69 72 73 74 20 20 20 20   newest first    `}</pre>
	</header>

	<ol class="timeline">
		{incidents.map((i) => (
			<li class={`card sev-${i.severity}`}>
				<span class="year">{i.year}</span>
				<div class="body">
					<div class="row">
						<span class={`sev sev-${i.severity}`}>{severityLabel[i.severity]}</span>
						<span class="title">{i.title}</span>
						{i.cve && <span class="cve">{i.cve}</span>}
					</div>
					<p class="annotation">{i.annotation}</p>
					{i.link && (
						<p class="link">
							<a href={i.link.href} rel="noopener">&gt; {i.link.label} →</a>
						</p>
					)}
				</div>
			</li>
		))}
	</ol>
</article>

<style>
	.incidents {
		padding: 1rem 1.25rem;
		color: var(--ink);
		font-family: var(--font-xp-ui, system-ui, sans-serif);
	}
	.hex-chrome {
		background: var(--ink);
		color: var(--pink-200);
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--pink-400);
		margin-bottom: 1rem;
	}
	.hex-chrome .hex {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.25;
		margin: 0;
		white-space: pre;
	}
	.timeline {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.9rem;
	}
	.card {
		display: grid;
		grid-template-columns: 4rem 1fr;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: var(--cream);
		border: 1px solid var(--pink-300);
		border-left: 4px solid var(--pink-400);
	}
	.card.sev-critical { border-left-color: #c80050; }
	.card.sev-high     { border-left-color: #e06a00; }
	.card.sev-med      { border-left-color: #caa200; }
	.card.sev-low      { border-left-color: #4aa500; }
	.card.sev-info     { border-left-color: #3090c8; }

	.year {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--pink-600);
		align-self: start;
	}
	.body .row {
		display: flex;
		gap: 0.55rem;
		align-items: baseline;
		flex-wrap: wrap;
		margin-bottom: 0.25rem;
	}
	.sev {
		display: inline-block;
		padding: 0.05rem 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		border-radius: 2px;
		color: var(--cream);
	}
	.sev.sev-critical { background: #c80050; }
	.sev.sev-high     { background: #e06a00; }
	.sev.sev-med      { background: #caa200; color: var(--ink); }
	.sev.sev-low      { background: #4aa500; }
	.sev.sev-info     { background: #3090c8; }

	.title {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		color: var(--ink);
	}
	.cve {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
	.annotation {
		margin: 0.15rem 0;
		line-height: 1.45;
	}
	.link {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.link a {
		color: var(--pink-600);
		text-decoration: none;
	}
	.link a:hover { text-decoration: underline; }

	@media (max-width: 520px) {
		.card {
			grid-template-columns: 1fr;
			gap: 0.3rem;
		}
	}
</style>
```

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 3: Register the app + wire rendering

**Files:**
- Modify: `src/data/apps.ts`
- Modify: `src/components/desktop/Desktop.astro` (and/or `MobileFallback.astro` depending on pattern)

- [ ] **Step 1: Add to `apps.ts`**

Insert this entry into the `apps` array, after the `memes` entry (or any other reasonable spot — order there affects desktop icon order):

```ts
	{
		id: 'incidents',
		label: 'incidents',
		glyph: '🚨',
		title: 'incidents.log',
		ogDescription: 'notable security incidents and CVEs mills has personally responded to. structured war stories, not resume bullets.',
		x: 260,
		y: 120,
		width: 640,
		height: 560,
	},
```

- [ ] **Step 2: Wire the component wherever apps are rendered**

Same pattern as PR 3's Task 3. `grep -n "Privacy\|About\|Mail" src/components/desktop/Desktop.astro` shows the pattern. Add `Incidents` the same way:
- If there's a switch/if ladder on `id`, add a `case 'incidents'` that renders `<Incidents />`.
- If there's a component registry map, add `'incidents': Incidents` to it.

Same for `MobileFallback.astro` if applicable.

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Smoke**

```bash
npm run dev
```

- Desktop: confirm `incidents` icon appears; double-click opens the window; hex-dump header visible; cards render with year + severity pill + title
- Direct route: `http://localhost:4321/incidents/` loads the focused app
- Mobile viewport: cards stack full-width per the media query; icon in mobile launcher
- Severity colors match expectation across all entries

Kill dev server.

- [ ] **Step 5: Commit Tasks 1-3**

```bash
git add src/data/incidents.ts src/components/desktop/apps/Incidents.astro src/data/apps.ts src/components/desktop/Desktop.astro src/components/desktop/MobileFallback.astro
git status --short
```

Expected: 3-5 files staged (only the ones you actually touched).

```bash
git commit -m "$(cat <<'EOF'
feat(apps): /incidents/ security war-stories wall (#44)

Severity-coded card timeline, newest first. Hex-dump header chrome; real
incidents in src/data/incidents.ts. Severity colors reuse site palette.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the `incidents` terminal command

**Files:**
- Modify: `src/scripts/terminal/commands/basic.ts`

- [ ] **Step 1: Register the command**

Add an import at the top of `basic.ts`:

```ts
import { incidents } from '../../../data/incidents';
```

Register the command inside the existing `register(...)` call:

```ts
	{
		name: 'incidents',
		summary: 'list security incidents and CVEs',
		usage: 'incidents [year]',
		handler: ({ args, out }) => {
			const yearArg = args[0] ? Number(args[0]) : null;
			const filtered = yearArg && !Number.isNaN(yearArg)
				? incidents.filter((i) => i.year === yearArg)
				: incidents;

			if (filtered.length === 0) {
				out(`no incidents${yearArg ? ` in ${yearArg}` : ''}.`, 't-dim');
				return;
			}

			const sevClass: Record<string, string> = {
				critical: 't-err',
				high: 't-err',
				med: 't-warn',
				low: 't-ok',
				info: 't-dim',
			};

			for (const i of filtered) {
				const sev = i.severity.toUpperCase().padEnd(9);
				out(`  ${i.year}  ${sev} ${i.title}`, sevClass[i.severity]);
			}
			out('');
			out(`  ${filtered.length} incident${filtered.length === 1 ? '' : 's'}${yearArg ? ` in ${yearArg}` : ''}`, 't-dim');
			if (!yearArg) out('  filter by year:  incidents <year>', 't-dim');
		},
	},
```

(If `t-ok` / `t-warn` classes don't exist in the current stylesheet, use `t-dim` for the low/med rows and leave the rest as `t-err`/default. `grep -n "t-err\|t-warn\|t-ok\|t-dim" src/styles/` to confirm existing classes.)

- [ ] **Step 2: Smoke**

```bash
npm run check
npm run dev
```

Terminal:

| Command | Expected |
|---|---|
| `help` | `incidents` listed |
| `incidents` | prints every incident one per line, severity-colored |
| `incidents 2023` | filters to entries from 2023 (or empty message if none) |
| `incidents 9999` | `no incidents in 9999.` |
| `man incidents` | shows `USAGE: incidents [year]` |

Kill dev server.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/terminal/commands/basic.ts
git commit -m "$(cat <<'EOF'
feat(terminal): add incidents command with year filter (#44)

Lists every incident from src/data/incidents.ts severity-colored, or
a year-filtered subset. Reuses existing terminal output classes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none.

- [ ] **Step 1: Clean, check, build**

```bash
git status --short
npm run check
SITE_URL=https://millsymills.com npm run build
```

Expected: empty status; 0 errors; build exits 0.

- [ ] **Step 2: Confirm route + OG image**

```bash
ls dist/incidents/index.html dist/og/incidents.svg
```

Expected: both exist.

- [ ] **Step 3: Commits on branch**

```bash
git log --oneline origin/main..HEAD
```

Expected: two commits.

---

## Task 6: Push + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin phase-5c/44-incidents
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: /incidents/ security war-stories wall (#44)" --body "$(cat <<'EOF'
Closes #44.

## Summary
- New \`Incidents.astro\` desktop app rendering a severity-coded card timeline of security incidents and CVEs
- \`src/data/incidents.ts\` typed list, \`<N>\` entries, newest first (\`<N>\` = final count from input C)
- Hex-dump header chrome; card layout with year badge + severity pill + title + annotation + optional link
- New \`incidents [year]\` terminal command with optional year filter

## Test plan
- [ ] \`npm run check\` clean
- [ ] \`npm run build\` clean; \`dist/incidents/index.html\` exists
- [ ] Desktop: icon opens the app, cards render, severity colors visible
- [ ] Mobile viewport: cards stack full-width
- [ ] Terminal: \`incidents\` lists all; \`incidents <year>\` filters; \`incidents 9999\` returns empty
- [ ] \`./scripts/assert-no-url-leakage.sh\` passes

Spec: \`docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md\`
Depends on: #<PR-1 number> merged first

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Definition of done

- All tasks' checkboxes checked
- CI passes
- ≥5 incident entries rendered
- No fabricated content — every entry is real and NDA-cleared
- Terminal `incidents` + `incidents <year>` work
