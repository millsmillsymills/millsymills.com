# Phase 5c — PR 1: shared infra (virtual-fs + PUBLIC_GIT_SHA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Factor the terminal's fake-filesystem content into a shared `src/data/virtual-fs.ts` module that later PRs (#41 dotfiles, #45 vscode.exe) can consume, and expose the build's git SHA as `import.meta.env.PUBLIC_GIT_SHA` so later PRs (#43 privacy, #45 vscode status bar) can render it.

**Architecture:** Pure refactor + one build-time config tweak. Move the `Entry` interface and content strings out of `src/scripts/terminal/filesystem.ts` into `src/data/virtual-fs.ts`. `filesystem.ts` becomes a 10-line adapter that re-exports the type and returns a cloned record. `astro.config.mjs` reads `GITHUB_SHA` (CI) or `git rev-parse HEAD` (local) at build time and injects via `vite.define`. Zero user-visible change.

**Tech Stack:** Astro 6, TypeScript, Node `child_process` (built-in).

**Spec:** `docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md` — sections *Shared substrate* and *Ship order* (row 1).
**Branch:** `phase-5c/shared-virtual-fs` (cut from `main` after the spec commit is on `main`).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/virtual-fs.ts` | create | Single source of truth for the fake-filesystem tree + `Entry` type |
| `src/scripts/terminal/filesystem.ts` | modify | Becomes thin adapter: re-exports type, clones virtualFs |
| `astro.config.mjs` | modify | Resolve git SHA at build time, inject via `vite.define` |
| `src/env.d.ts` | create | TypeScript augmentation for `import.meta.env.PUBLIC_GIT_SHA` |

No new tests (convention for this repo is smoke; no Vitest configured, and no runtime logic added).

**Import ripples:** two files import from `./filesystem`:
- `src/scripts/terminal/repl.ts:9` — `import { buildFs } from './filesystem'`  (stays; `buildFs` still exported by the adapter)
- `src/scripts/terminal/registry.ts:9` — `import type { Entry } from './filesystem'`  (stays; `Entry` re-exported by the adapter)

Neither import needs to change.

---

## Task 0: Pre-flight — verify baseline clean

Make sure you start from a clean worktree on the right branch.

**Files:** none modified.

- [ ] **Step 1: Confirm current branch is `phase-5c/shared-virtual-fs`**

Run:
```bash
git branch --show-current
```

Expected: `phase-5c/shared-virtual-fs`.

If you're on `phase-5c-batch` or anywhere else, cut the PR branch now:
```bash
git checkout -b phase-5c/shared-virtual-fs
```

If the branch already exists locally, `git checkout phase-5c/shared-virtual-fs`. Never work on this PR directly on `main` or `phase-5c-batch`.

- [ ] **Step 2: Confirm tree is clean**

Run:
```bash
git status --short
```

Expected: empty output (no unstaged changes).

- [ ] **Step 3: Confirm Astro type-check passes**

Run:
```bash
npm run check
```

Expected output tail:
```
Result (63 files):
- 0 errors
- 0 warnings
- 0 hints
```

If errors, stop — baseline is broken and this PR can't be attributed to any regression introduced here.

---

## Task 1: Create `src/data/virtual-fs.ts`

Move the fake-filesystem data out of the terminal layer into a data module. The type gains a `language?` field (consumed by #45 later, harmless now) and keeps the existing `priv?` field.

**Files:**
- Create: `src/data/virtual-fs.ts`

- [ ] **Step 1: Write the full module**

Create `src/data/virtual-fs.ts` with this exact content:

```ts
/*
 * Shared fake-filesystem tree.
 *
 * Source of truth for both the terminal app (via src/scripts/terminal/filesystem.ts
 * adapter) and vscode.exe (once #45 ships). Files are read-only string blobs;
 * directories are markers with no content.
 */

import { profile, experience, coreSkills } from './profile';

export interface Entry {
	type: 'file' | 'dir';
	content?: string;
	/** if true, requires sudo to read in terminal; hidden from vscode.exe tree */
	priv?: boolean;
	/** optional language hint for vscode.exe status bar ('zsh' | 'lua' | 'markdown' | 'text') */
	language?: string;
}

const trim = (s: string) => s.replace(/^\n/, '').replace(/\n+$/, '\n');

const aboutTxt = trim(`
${profile.name} (${profile.handle})
${profile.title} @ ${profile.currentEmployer}
${profile.pronouns} | ${profile.location}

${profile.summary}

contact:  ${profile.email}
github:   ${profile.github}
certs:    ${profile.certifications.join(', ')}
`);

const experienceTxt = trim(
	experience
		.map(
			(j) => `
== ${j.title} — ${j.company} (${j.period}) ==
${j.bullets.map((b) => '  - ' + b).join('\n')}
`,
		)
		.join('\n'),
);

const skillsTxt = trim(
	coreSkills.map((g) => `${g.group}:\n  ${g.items.join(', ')}`).join('\n\n'),
);

const bashrc = trim(`
# ~/.bashrc — minimal
export PS1='\\u@\\h:\\w\\$ '
export EDITOR=vim
alias ll='ls -lah'
alias gs='git status'
alias please='sudo $(fc -ln -1)'
`);

const passwd = trim(`
root:x:0:0:root:/root:/bin/bash
mills:x:1000:1000:Andrew Mills:/home/mills:/bin/zsh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`);

const shadow = trim(`
root:!:20089:0:99999:7:::
mills:$6$rounds=656000$abcd$flag{etc_shadow_should_not_be_world_readable}:20089:0:99999:7:::
nobody:*:20089:0:99999:7:::
`);

const hosts = trim(`
127.0.0.1       localhost
::1             localhost
192.168.1.1     gateway.local
192.168.1.10    mills-laptop.local
192.168.1.42    lab.local
192.168.1.100   pihole.local
192.168.1.250   nas.local
`);

const motd = trim(`
welcome to mills@millsymills:~

this terminal is a toy. ls / cat / cd / nmap / curl / ssh / sudo / flag — try \`help\`.

real shells exit. this one closes the window.
`);

export const virtualFs: Record<string, Entry> = {
	'/': { type: 'dir' },
	'/home': { type: 'dir' },
	'/home/mills': { type: 'dir' },
	'/home/mills/about.txt': { type: 'file', content: aboutTxt, language: 'text' },
	'/home/mills/experience.txt': { type: 'file', content: experienceTxt, language: 'text' },
	'/home/mills/skills.txt': { type: 'file', content: skillsTxt, language: 'text' },
	'/home/mills/resume.md': { type: 'file', content: '(see /files/resume.md served from public/)', language: 'markdown' },
	'/home/mills/.bashrc': { type: 'file', content: bashrc, language: 'bash' },
	'/etc': { type: 'dir' },
	'/etc/passwd': { type: 'file', content: passwd, language: 'text' },
	'/etc/shadow': { type: 'file', content: shadow, priv: true, language: 'text' },
	'/etc/hosts': { type: 'file', content: hosts, language: 'text' },
	'/etc/motd': { type: 'file', content: motd, language: 'text' },
};
```

- [ ] **Step 2: Verify the file type-checks**

Run:
```bash
npm run check
```

Expected: 0 errors, 0 warnings. Astro will find the new file and include it in the check.

- [ ] **Step 3: Commit just this file**

```bash
git add src/data/virtual-fs.ts
git commit -m "$(cat <<'EOF'
feat(data): extract virtual-fs module from terminal filesystem

Source-of-truth fake-filesystem tree for terminal + (future) vscode.exe.
Adds optional `language` hint field consumed by the vscode status bar in #45.
Byte-identical content with the existing terminal fs; the adapter change
is the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one file changed, ~80 insertions.

---

## Task 2: Convert `src/scripts/terminal/filesystem.ts` to a thin adapter

**Files:**
- Modify: `src/scripts/terminal/filesystem.ts` (replace entire contents)

- [ ] **Step 1: Replace the file contents**

Replace `src/scripts/terminal/filesystem.ts` with this exact content:

```ts
/*
 * Thin adapter over src/data/virtual-fs.ts.
 *
 * Existed historically as the data owner; now just clones the shared tree so
 * terminal mutations (if any are added later) can't leak into other consumers
 * like vscode.exe. Re-exports `Entry` so existing importers (registry.ts)
 * don't have to change.
 */

import { virtualFs, type Entry } from '../../data/virtual-fs';

export type { Entry } from '../../data/virtual-fs';

export function buildFs(): Record<string, Entry> {
	return { ...virtualFs };
}
```

- [ ] **Step 2: Verify the type-check still passes**

Run:
```bash
npm run check
```

Expected: 0 errors, 0 warnings. If errors mention `registry.ts:9` or `repl.ts:9`, the re-export didn't land correctly — re-check Step 1.

- [ ] **Step 3: Manual smoke — terminal still works**

Start the dev server in the background or a side terminal:
```bash
npm run dev
```

Open `http://localhost:4321/` in a browser. Open the terminal app. Run each of these and confirm output:

| Command | Expected |
|---|---|
| `whoami` | `mills` |
| `pwd` | `/home/mills` |
| `ls ~` | lists `about.txt`, `experience.txt`, `skills.txt`, `resume.md`, `.bashrc` |
| `cat ~/.bashrc` | prints the bash config |
| `cat /etc/motd` | prints the MOTD |
| `cat /etc/shadow` | errors with permission denied (priv flag preserved) |
| `sudo cat /etc/shadow` | prompts for password; on correct password, shows shadow content |

Kill the dev server (Ctrl-C in its terminal).

- [ ] **Step 4: Commit**

```bash
git add src/scripts/terminal/filesystem.ts
git commit -m "$(cat <<'EOF'
refactor(terminal): thin filesystem adapter over shared virtual-fs

Keeps buildFs() + Entry exports for existing callers (registry.ts, repl.ts).
No behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one file changed, file shrinks from ~100 lines to ~15.

---

## Task 3: Add `PUBLIC_GIT_SHA` to `astro.config.mjs`

Resolve the build's git SHA once and inject via Vite's `define`. Uses `execFileSync` (no shell, no injection surface) not `execSync`.

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Add the SHA resolver and define**

Open `astro.config.mjs`. It currently looks like:

```js
// @ts-check
import { defineConfig } from 'astro/config';

const siteUrl = process.env.SITE_URL ?? 'https://millsymills.com';
const noIndex = process.env.NO_INDEX === 'true';

// ... guards ...

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

Apply two edits.

**Edit A:** Add the import and resolver near the top of the file, after the `defineConfig` import.

Change:
```js
// @ts-check
import { defineConfig } from 'astro/config';

const siteUrl = process.env.SITE_URL ?? 'https://millsymills.com';
```

To:
```js
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
```

**Edit B:** Add the define inside the `vite.define` object.

Change:
```js
	vite: {
		define: {
			'import.meta.env.NO_INDEX': JSON.stringify(noIndex ? 'true' : 'false'),
		},
	},
```

To:
```js
	vite: {
		define: {
			'import.meta.env.NO_INDEX': JSON.stringify(noIndex ? 'true' : 'false'),
			'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha),
		},
	},
```

- [ ] **Step 2: Verify the config parses**

Run:
```bash
npm run check
```

Expected: 0 errors. Astro loads the config and will fail loudly if the syntax is broken.

---

## Task 4: Add type declaration for `PUBLIC_GIT_SHA`

`import.meta.env.PUBLIC_GIT_SHA` needs a TypeScript type so consumers don't get `any`.

**Files:**
- Create: `src/env.d.ts`

- [ ] **Step 1: Create the type-augmentation file**

Create `src/env.d.ts` with this exact content:

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_GIT_SHA: string;
	readonly NO_INDEX: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Verify the type-check still passes**

Run:
```bash
npm run check
```

Expected: 0 errors, 0 warnings.

---

## Task 5: Smoke-verify the SHA injection

Quick in-and-out to confirm the define actually reaches the browser.

**Files:** none permanently modified (the smoke file is deleted at the end of the task).

- [ ] **Step 1: Create a throwaway check file**

Create `src/pages/__sha-check.astro` with this content:

```astro
---
const sha = import.meta.env.PUBLIC_GIT_SHA;
---
<!doctype html>
<html><body><pre id="sha">{sha}</pre></body></html>
```

- [ ] **Step 2: Build the site**

Run:
```bash
npm run build
```

Expected: build succeeds, `dist/__sha-check/index.html` exists.

- [ ] **Step 3: Confirm the SHA made it into the output**

Run:
```bash
grep -E '<pre id="sha">[0-9a-f]{7,}' dist/__sha-check/index.html
```

Expected: one match line showing a hex SHA (or `unknown` if git isn't available, but in this worktree git definitely is). If the `<pre>` shows empty or `undefined`, the define didn't attach — recheck Task 3.

- [ ] **Step 4: Delete the check file**

```bash
rm src/pages/__sha-check.astro
```

Confirm deletion:
```bash
ls src/pages/__sha-check.astro 2>&1 | head -1
```

Expected: `ls: src/pages/__sha-check.astro: No such file or directory`.

- [ ] **Step 5: Commit the config + env.d.ts changes (the check file is gone, so it won't be staged)**

```bash
git add astro.config.mjs src/env.d.ts
git status --short
```

Expected: two lines, both `M`/`A` for those two files, nothing else.

```bash
git commit -m "$(cat <<'EOF'
feat(build): expose PUBLIC_GIT_SHA via vite.define

CI uses GITHUB_SHA; local builds call git rev-parse HEAD via execFileSync
(no shell, no injection surface). Missing-git contexts fall back to
"unknown" so the UI always renders. Adds src/env.d.ts for type coverage.

Consumed by /privacy/ attestation footer (#43) and vscode.exe status bar (#45).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: two files changed.

---

## Task 6: Final verification

Full sweep before opening the PR.

**Files:** none modified.

- [ ] **Step 1: Clean tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Type-check clean**

```bash
npm run check
```

Expected: 0 errors, 0 warnings, 0 hints.

- [ ] **Step 3: Production build clean**

```bash
SITE_URL=https://millsymills.com npm run build
```

Expected: build succeeds, exit 0. Scan the output for new warnings beyond what `main` emits.

- [ ] **Step 4: Preview build loads**

```bash
npm run preview &
PREVIEW_PID=$!
sleep 3
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4321/
kill $PREVIEW_PID
```

Expected: `200`. If the preview server fails to start on 4321, it may have already picked a different port; check `npm run preview` output for the actual port.

- [ ] **Step 5: Confirm the three commits on this branch**

```bash
git log --oneline -3
```

Expected (order newest-first):
```
<sha> feat(build): expose PUBLIC_GIT_SHA via vite.define
<sha> refactor(terminal): thin filesystem adapter over shared virtual-fs
<sha> feat(data): extract virtual-fs module from terminal filesystem
```

---

## Task 7: Push + open PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-5c/shared-virtual-fs
```

Expected: pushed, tracking branch set.

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --title "refactor: shared virtual-fs + build-time PUBLIC_GIT_SHA (Phase 5c prep)" --body "$(cat <<'EOF'
## Summary
- Extracts terminal's fake-filesystem tree into \`src/data/virtual-fs.ts\` so both the terminal and (upcoming) \`vscode.exe\` consume one source of truth
- Adds \`import.meta.env.PUBLIC_GIT_SHA\` via build-time \`vite.define\` — resolved from \`GITHUB_SHA\` in CI or \`git rev-parse HEAD\` locally, falls back to \`"unknown"\`
- \`src/scripts/terminal/filesystem.ts\` becomes a 15-line adapter that clones the shared tree; existing callers (\`registry.ts\`, \`repl.ts\`) require no changes

Zero user-visible change. Foundation for Phase 5c batch (#41 dotfiles, #43 privacy, #45 vscode).

## Test plan
- [ ] \`npm run check\` clean
- [ ] \`npm run build\` clean
- [ ] Terminal smoke: \`ls ~\`, \`cat ~/.bashrc\`, \`cat /etc/shadow\` (denied), \`sudo cat /etc/shadow\` (succeeds)
- [ ] \`PUBLIC_GIT_SHA\` verified present in built HTML via the throwaway \`__sha-check\` route during development (removed before commit)

Spec: \`docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Record it.

---

## Definition of done

- All 7 tasks' checkboxes checked
- CI passes on the PR (Actions: build + type-check)
- `git log --oneline main..HEAD` shows exactly three commits
- No changes to user-visible behavior (terminal output byte-identical to `main`)
