# Phase 5c — PR 2: dotfiles in terminal FS (#41) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/home/mills/.dotfiles/` and real dotfile paths real in the terminal's fake filesystem. `cat ~/.zshrc` prints mills's actual zsh config; same for tmux, neovim, and git. A new `dotfiles` terminal command indexes the directory.

**Architecture:** Additive. Extends the shared `virtualFs` map (from PR 1) with new paths under `/home/mills/`. Adds one new command registration in `basic.ts`. No refactors.

**Tech Stack:** TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md` — section *#41 — Dotfiles in terminal FS*.
**Issue:** [#41](https://github.com/millsmillsymills/millsymills.com/issues/41)
**Branch:** `phase-5c/41-dotfiles`, cut from `main` after PR 1 merges.
**Depends on:** PR 1 (shared virtual-fs + PUBLIC_GIT_SHA) merged.
**Depends on input:** A — real `.zshrc`, `.tmux.conf`, `nvim/init.lua`, `git/config`, dotfiles `README.md` from mills (redacted as needed). See *Input A handling* below if content hasn't landed yet.

---

## Input A handling

This PR needs five content blobs from mills (input A). Two modes:

**Mode 1 — full content ready.** Use the real strings supplied by mills. Each Task 2 step shows exactly where to paste each blob.

**Mode 2 — partial or no content ready.** Per the spec's missing-content fallback, any file mills hasn't supplied gets this stub:

```
# not yet published — see https://github.com/millsmillsymills/dotfiles
# TODO(mills): populate with real content
```

and a `TODO(mills)` comment above the string constant in source. Open a tracking issue titled "`Phase 5c/#41: populate <filename> dotfile content`" labeled `content, phase-5c, blocker` referencing this PR. Do NOT invent fake content.

Before starting implementation, confirm with mills which mode applies per file. The tasks below assume Mode 1; if any file is Mode 2, substitute the stub above in the relevant Step 1 and move on.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/virtual-fs.ts` | modify | Add 5 dotfile content constants + 8 virtualFs entries |
| `src/scripts/terminal/commands/basic.ts` | modify | Register new `dotfiles` command with index constant |

No new files.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on the PR branch**

Run:
```bash
git branch --show-current
```

Expected: `phase-5c/41-dotfiles`.

If not, cut it from main:
```bash
git fetch origin
git checkout -b phase-5c/41-dotfiles origin/main
```

- [ ] **Step 2: Confirm PR 1 has landed**

Run:
```bash
git log --oneline origin/main | grep -E "virtual-fs|PUBLIC_GIT_SHA" | head -3
```

Expected: at least one line showing a PR-1 commit on `origin/main`. If empty, **stop** — PR 1 must merge before this PR can proceed (this PR modifies the file PR 1 creates).

- [ ] **Step 3: Confirm baseline clean**

```bash
git status --short
npm run check
```

Expected: empty status, 0 errors on check.

---

## Task 1: Add the dotfile content constants to `virtual-fs.ts`

Content strings live as `const`s at the top of the module, alongside the existing `bashrc`, `aboutTxt`, etc. Paste mills's real content inside each `trim(\`...\`)` block. Escape any backticks or `${` that would interfere with template-literal parsing.

**Files:**
- Modify: `src/data/virtual-fs.ts`

- [ ] **Step 1: Add the five content constants**

Open `src/data/virtual-fs.ts`. Find the existing `bashrc` constant (around line 42). Add these five new `const` declarations immediately after it, before the `passwd` const:

```ts
const zshrc = trim(`
<<< PASTE mills's .zshrc HERE — from input A >>>
`);

const tmuxConf = trim(`
<<< PASTE mills's .tmux.conf HERE — from input A >>>
`);

const nvimInit = trim(`
<<< PASTE mills's init.lua HERE — from input A >>>
`);

const gitConfig = trim(`
<<< PASTE mills's git/config HERE — from input A >>>
`);

const dotfilesReadme = trim(`
<<< PASTE README prose from input A HERE >>>
`);
```

**Substitute each `<<< PASTE ... >>>` placeholder with the actual content from input A.** Nothing ships with a `<<<` placeholder. If content is missing, use the Mode 2 stub from *Input A handling* above.

**Template literal escaping reminders:**
- Backticks inside content: escape as `` \` ``
- `${...}` expressions inside content: escape the dollar sign as `\${...}` so they aren't interpreted
- Literal `\` characters: double to `\\`

(These are the only template-literal footguns. Most dotfile content has none of these.)

- [ ] **Step 2: Verify type-check still passes**

Run:
```bash
npm run check
```

Expected: 0 errors. If there's a parse error, the most likely cause is an unescaped backtick or `${` inside one of the new blobs.

---

## Task 2: Add the dotfile entries to `virtualFs`

**Files:**
- Modify: `src/data/virtual-fs.ts`

- [ ] **Step 1: Extend the `virtualFs` object**

Find the `export const virtualFs: Record<string, Entry> = { ... }` declaration. Inside that object literal, add these entries immediately after the existing `/home/mills/.bashrc` line:

```ts
	'/home/mills/.zshrc': { type: 'file', content: zshrc, language: 'zsh' },
	'/home/mills/.tmux.conf': { type: 'file', content: tmuxConf, language: 'text' },
	'/home/mills/.config': { type: 'dir' },
	'/home/mills/.config/nvim': { type: 'dir' },
	'/home/mills/.config/nvim/init.lua': { type: 'file', content: nvimInit, language: 'lua' },
	'/home/mills/.config/git': { type: 'dir' },
	'/home/mills/.config/git/config': { type: 'file', content: gitConfig, language: 'text' },
	'/home/mills/.dotfiles': { type: 'dir' },
	'/home/mills/.dotfiles/README.md': { type: 'file', content: dotfilesReadme, language: 'markdown' },
```

Order inside the object doesn't semantically matter — terminal `ls` sorts at render time — but placing these next to `.bashrc` keeps like things together.

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Manual smoke — the new files exist in the terminal**

```bash
npm run dev
```

Open `http://localhost:4321/`, open the terminal app, and run:

| Command | Expected |
|---|---|
| `ls ~` | lists `.bashrc`, `.zshrc`, `.tmux.conf`, `.dotfiles/`, `.config/` among the others (dotfiles may or may not show depending on whether ls honors the hidden rule — see Step 4 below) |
| `ls -a ~` | explicitly lists all including hidden — confirm `.zshrc`, `.tmux.conf`, `.dotfiles`, `.config` present |
| `cat ~/.zshrc` | prints the zshrc content (or the Mode 2 stub) |
| `cat ~/.tmux.conf` | prints the tmux config |
| `cat ~/.config/nvim/init.lua` | prints the init.lua content |
| `cat ~/.config/git/config` | prints the git config |
| `cat ~/.dotfiles/README.md` | prints the README |
| `ls ~/.dotfiles/` | lists `README.md` |
| `cd ~/.config/nvim && pwd` | `/home/mills/.config/nvim` |

- [ ] **Step 4: Confirm `ls` hidden-file behavior matches expectations**

If `ls ~` (Step 3) did not list the dotfiles, confirm this is intended by reading `src/scripts/terminal/commands/basic.ts` — look at the `ls` handler and check whether it filters entries starting with `.` by default. If the existing behavior already shows `.bashrc` in plain `ls`, the new dotfiles should appear the same way; if not, they shouldn't either — both must be consistent. Do NOT modify `ls` behavior as part of this PR; any change to the hidden-file rule is out of scope.

Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/data/virtual-fs.ts
git commit -m "$(cat <<'EOF'
feat(terminal): real dotfiles in fake filesystem (#41)

Adds ~/.zshrc, ~/.tmux.conf, ~/.config/nvim/init.lua, ~/.config/git/config,
and ~/.dotfiles/README.md as readable entries in the shared virtualFs.
Content is real (or redacted) from mills's machine.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one file changed.

---

## Task 3: Add the `dotfiles` terminal command

**Files:**
- Modify: `src/scripts/terminal/commands/basic.ts`

- [ ] **Step 1: Add the index constant and register the command**

Open `src/scripts/terminal/commands/basic.ts`. At the top of the file, after the imports and the existing `resolvePath` helper, add this constant:

```ts
const DOTFILE_INDEX: Array<[string, string]> = [
	['.zshrc', 'zsh config — aliases, prompt, plugins'],
	['.tmux.conf', 'tmux — prefix, splits, status bar'],
	['.config/nvim/init.lua', 'neovim — leader, plugins, autocmds'],
	['.config/git/config', 'git — aliases, signing, rebase-on-pull'],
	['.dotfiles/README.md', 'intro + link to public dotfiles repo'],
];
```

Find the `register(` call (there is one big multi-command `register(...)` call in this file). Add this new command object inside the argument list — sort it alphabetically if the existing ones are sorted, otherwise append:

```ts
	{
		name: 'dotfiles',
		summary: 'list dotfiles under ~/.dotfiles/',
		handler: ({ out }) => {
			out('~/.dotfiles/ — mills\'s config files', 't-dim');
			out('');
			const width = Math.max(...DOTFILE_INDEX.map(([name]) => name.length));
			for (const [name, desc] of DOTFILE_INDEX) {
				out(`  ${name.padEnd(width + 2)}${desc}`);
			}
			out('');
			out('use `cat ~/<file>` or `cat ~/.dotfiles/<file>` to view.', 't-dim');
		},
	},
```

(Output classes `t-dim` match existing commands. If `basic.ts` uses a different class for dim hints, use that instead — grep `t-dim` in this file to confirm.)

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Smoke — the new command works**

```bash
npm run dev
```

Open the terminal, run:

| Command | Expected |
|---|---|
| `help` | `dotfiles` appears in the list with its summary |
| `dotfiles` | prints the index (5 lines with aligned descriptions) |
| `man dotfiles` | shows `NAME / USAGE` for the command |

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/terminal/commands/basic.ts
git commit -m "$(cat <<'EOF'
feat(terminal): add dotfiles command indexing ~/.dotfiles/ (#41)

Prints the file index with aligned descriptions. Content lives in
virtualFs; this command is a discovery affordance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Final verification

**Files:** none.

- [ ] **Step 1: Clean tree, type-check clean, build clean**

```bash
git status --short
npm run check
SITE_URL=https://millsymills.com npm run build
```

Expected: empty status; 0 errors on check; build exits 0.

- [ ] **Step 2: Confirm two commits on this branch vs. main**

```bash
git log --oneline origin/main..HEAD
```

Expected (order newest-first):
```
<sha> feat(terminal): add dotfiles command indexing ~/.dotfiles/ (#41)
<sha> feat(terminal): real dotfiles in fake filesystem (#41)
```

- [ ] **Step 3: Confirm no TODO(mills) leaks (unless Mode 2 was used)**

```bash
grep -rn "TODO(mills)" src/data/virtual-fs.ts || echo "no TODO markers"
```

If Mode 1 (full content supplied by mills): expected `no TODO markers`.
If Mode 2 (fallback stubs used for any file): expected one `TODO(mills)` line per stubbed file, and a tracking issue must exist.

---

## Task 5: Push + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin phase-5c/41-dotfiles
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(terminal): real dotfiles in fake filesystem (#41)" --body "$(cat <<'EOF'
Closes #41.

## Summary
- Adds \`.zshrc\`, \`.tmux.conf\`, \`.config/nvim/init.lua\`, \`.config/git/config\`, and \`.dotfiles/README.md\` under \`/home/mills/\` in the shared \`virtualFs\` map
- Adds \`dotfiles\` terminal command that prints the indexed listing with descriptions
- Content is real (or redacted) from mills's machine — no fake placeholders

## Test plan
- [ ] \`npm run check\` clean
- [ ] \`npm run build\` clean
- [ ] Terminal: \`ls -a ~\` lists new dotfiles; \`cat ~/.zshrc\` etc. print meaningful content
- [ ] Terminal: \`dotfiles\` command prints index with aligned descriptions
- [ ] Terminal: \`help\` lists the new command; \`man dotfiles\` works

Spec: \`docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md\`
Depends on: #<PR-1 number> merged first

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Definition of done

- All tasks' checkboxes checked
- CI passes
- `git log --oneline main..HEAD` shows two commits
- `cat ~/.zshrc` in the terminal prints mills's real content (or an honest Mode 2 stub)
- `dotfiles` command lists all five files with descriptions
- No fake content — everything is either real or explicitly a "not yet published" stub with a tracking issue
