# Phase 5c batch — design

Status: design-approved 2026-04-20. Implementation plan: `2026-04-20-phase-5c-batch-plan.md` (follow-up).

Covers five Phase-5c polish issues shipped together as one spec, one worktree, branching into five PRs off a shared-infra base:

1. **#41** — real dotfiles in the terminal fake FS
2. **#42** — publish PGP key + fingerprint surfaces
3. **#43** — `/privacy/` page
4. **#44** — `/incidents/` wall
5. **#45** — `vscode.exe` desktop app

## Goals

- Ship five independent nerd-cred / credibility features as a single coherent batch
- Factor the shared substrate (virtual filesystem, build-time git SHA) so #41/#45 don't duplicate
- Keep each PR focused and reviewable (no 2000-line PRs)
- Zero new third-party runtime dependencies

## Non-goals (explicitly deferred)

- Syntax highlighting in `vscode.exe` (shiki — follow-up issue)
- `Cmd-P` quick-open in `vscode.exe` (follow-up issue)
- 11th CTF flag placement inside a vscode file (follow-up issue — touches `flags.exe` count/copy)
- Source-Control tab with real git log in `vscode.exe` (follow-up issue)
- `age` pubkey publication (PGP only for v1; add `age` later if desired)
- security.txt auto-renewal via Terraform (manual 12-month calendar reminder is fine for v1)
- A proof-of-work email gate (separate issue if pursued, per #42 body)

## Confirmed decisions

These defaults were proposed in brainstorming and approved:

| # | Decision | Value |
|---|---|---|
| B.1 | Key type | PGP |
| B.2 | Key UIDs | `mills@millsymills.com` only |
| B.3 | Key expiry | 2 years |
| B.4 | Ship security.txt | Yes, 12-month `Expires:` |
| D | Incidents route | `/incidents/` |
| E.1 | Google Fonts | Self-host |
| E.2 | CF log retention | 90 days — existing `infra/s3.tf:137`; privacy page text matches reality |
| 1 | PR strategy | One PR per issue |
| 2 | Worktree strategy | One worktree (`.worktrees/phase-5c-batch`), five feature branches |
| 3 | Command names | `dotfiles`, `pubkey`, `privacy`, `incidents` — ship as-is |
| 4 | `vscode.exe` scope | Evocative lookalike, not full-fidelity |
| 5 | Syntax highlighting | Plain-text v1 |
| 6 | `vscode.exe` stretch items | Commit SHA in status bar only; rest deferred |
| 7 | 11th flag placement | Defer to separate issue |

## Inputs required from mills

Must land before the dependent PR can be implemented:

- **A (gates PR 2 + PR 6):** real `.zshrc`, `.tmux.conf`, `nvim/init.lua`, `git/config`, dotfiles `README.md` (redacted as needed)
- **B (gates PR 5):** ASCII-armored `pgp.asc`, fingerprint, short key ID, created/expires dates; binary WKD file generated via the rotation helper
- **C (gates PR 4):** NDA-vetted incidents list — year, severity, optional CVE, title, annotation, optional external link

PRs 1, 3 can proceed without any of these.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                       shared substrate                      │
│  src/data/virtual-fs.ts  ←──── one source of truth tree    │
│  astro.config.mjs (PUBLIC_GIT_SHA)                          │
└──────┬─────────────────┬──────────────────────┬─────────────┘
       │                 │                      │
       ▼                 ▼                      ▼
  terminal fs       vscode file tree     Privacy.astro /
  (existing         (new)                VSCode status bar
  adapter)                               (consume SHA)
       │                 │
       ▼                 ▼
  terminal commands   vscode UI
  (ls/cat/dotfiles/
  pubkey/privacy/
  incidents)

┌────────────────────────── new apps ─────────────────────────┐
│  Privacy.astro    Incidents.astro    VSCode.astro          │
│  (apps.ts entry for each → auto-gets desktop icon, mobile  │
│   slot, /privacy/ /incidents/ /vscode/ routes, OG cards)   │
└─────────────────────────────────────────────────────────────┘

┌──────────────── #42 key-surface artifacts ──────────────────┐
│  public/pgp.asc                                             │
│  public/.well-known/openpgpkey/hu/<wkd-hash>                │
│  public/.well-known/openpgpkey/policy                       │
│  public/.well-known/security.txt                            │
│  src/data/pgp.ts (fingerprint + metadata)                   │
│    ├──→ About.astro (keys block)                            │
│    ├──→ Mail.astro (fingerprint next to email)              │
│    └──→ terminal `pubkey` command                           │
└─────────────────────────────────────────────────────────────┘
```

## Shared substrate

### `src/data/virtual-fs.ts` (new)

Single source of truth for the fake-filesystem tree. Exports:

```ts
export interface Entry {
  type: 'file' | 'dir';
  content?: string;
  priv?: boolean;     // requires sudo; hidden from vscode tree
  language?: string;  // hint for vscode status bar ('zsh' | 'lua' | 'markdown' | 'text')
}

export const virtualFs: Record<string, Entry>;
```

Contains all existing entries from `filesystem.ts` (about.txt, experience.txt, skills.txt, resume.md, .bashrc, passwd, shadow, hosts, motd) plus new dotfile entries for #41. Dotfile content strings live inline as `const`s for readability.

`src/scripts/terminal/filesystem.ts` becomes a thin adapter:

```ts
import { virtualFs } from '../../data/virtual-fs';
export type { Entry } from '../../data/virtual-fs';
export function buildFs(): Record<string, Entry> {
  return { ...virtualFs };  // clone so terminal mutations can't leak
}
```

Existing `Entry` import sites in terminal commands continue to work through the re-export.

### Build-time `PUBLIC_GIT_SHA`

`astro.config.mjs` reads the SHA once at build time and exposes it as a Vite-defined constant. Uses `execFileSync` (no shell, fixed argv, no injection surface) rather than `execSync`:

```js
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

export default defineConfig({
  // ...existing config...
  vite: {
    define: { 'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha) },
  },
});
```

CI sets `GITHUB_SHA` automatically. Local builds call `git rev-parse HEAD` via `execFileSync` (argv array, no shell parsing). No-git contexts (tarball build, unusual CI) get `'unknown'` — UI always renders safely.

Consumers: `Privacy.astro` (attestation footer) and `VSCode.astro` (status bar).

## Per-issue design

### #41 — Dotfiles in terminal FS

**Files touched**

- `src/data/virtual-fs.ts` — add dotfile entries + content strings (migrate existing `bashrc` constant for consistency)
- `src/scripts/terminal/filesystem.ts` — thin adapter per above
- `src/scripts/terminal/commands/basic.ts` — register new `dotfiles` command

**New virtualFs paths**

| Path | Source | Notes |
|---|---|---|
| `/home/mills/.zshrc` | input A | real (redacted) content |
| `/home/mills/.tmux.conf` | input A | |
| `/home/mills/.config/` | — | dir |
| `/home/mills/.config/nvim/` | — | dir |
| `/home/mills/.config/nvim/init.lua` | input A | real (or excerpt) |
| `/home/mills/.config/git/` | — | dir |
| `/home/mills/.config/git/config` | input A | |
| `/home/mills/.dotfiles/` | — | dir |
| `/home/mills/.dotfiles/README.md` | input A | intro + public repo link |

**`dotfiles` command output**

```
$ dotfiles
~/.dotfiles/ — mills's config files
  .zshrc              zsh config — aliases, prompt, plugins
  .tmux.conf          tmux — prefix, splits, status bar
  nvim/init.lua       neovim — leader, plugins, autocmds
  git/config          git — aliases, signing, rebase-on-pull
  README.md           intro + link to public dotfiles repo
use `cat ~/.dotfiles/<file>` to view.
```

Index is a constant (`DOTFILE_INDEX`) defined in `basic.ts` — short, low-churn, keeps the command handler trivial.

**Missing-content fallback:** any file mills hasn't supplied at PR-time gets a placeholder `# not yet published — see github.com/millsmillsymills/dotfiles` with a `TODO(mills)` comment in source and a tracking issue opened. Never a stub with fake content.

### #42 — PGP key + fingerprint surfaces

**Files added**

- `public/pgp.asc` — ASCII-armored public key (input B)
- `public/.well-known/openpgpkey/hu/<wkd-hash>` — binary key for WKD
- `public/.well-known/openpgpkey/policy` — empty file required by WKD spec
- `public/.well-known/security.txt` — contact + encryption + canonical + expiry
- `src/data/pgp.ts` — `{ fingerprint, shortId, createdAt, expiresAt }` single source of truth
- `scripts/generate-wkd.sh` — regenerate WKD hash + binary file on key rotation

**Files modified**

- `src/components/desktop/apps/About.astro` — add compact keys block: fingerprint monospace block + "`curl https://millsymills.com/pgp.asc`" one-liner
- `src/components/desktop/apps/Mail.astro` — fingerprint + short-id next to email address
- `src/scripts/terminal/commands/basic.ts` — register `pubkey` command: prints fingerprint, `curl /pgp.asc` hint, then full ASCII-armored block

**`pubkey` command output**

```
$ pubkey
Fingerprint: AAAA BBBB CCCC ....
Short ID:    DEADBEEF
Created:     2026-04-20
Expires:     2028-04-20

fetch the full key:
  curl https://millsymills.com/pgp.asc

-----BEGIN PGP PUBLIC KEY BLOCK-----
... (full armored block) ...
-----END PGP PUBLIC KEY BLOCK-----
```

**WKD mechanics**

WKD requires the binary key at `/.well-known/openpgpkey/hu/<zbase32(sha1(localpart))>` (local part = `mills`). `scripts/generate-wkd.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
UID_EMAIL="mills@millsymills.com"
HASH=$(gpg --with-wkd-hash --list-keys "$UID_EMAIL" \
  | grep -oE '\b[ybndrfg8ejkmcpqxot1uwisza345h769]{32}@' \
  | head -1 \
  | sed 's/@$//')
test -n "$HASH"
mkdir -p public/.well-known/openpgpkey/hu
gpg --yes --output "public/.well-known/openpgpkey/hu/$HASH" \
    --export-options export-minimal --export "$UID_EMAIL"
touch public/.well-known/openpgpkey/policy
echo "WKD file: public/.well-known/openpgpkey/hu/$HASH"
```

Run once at key creation and any future rotation. Output file is committed.

**security.txt contents**

```
Contact: mailto:mills@millsymills.com
Encryption: https://millsymills.com/pgp.asc
Expires: 2027-04-20T00:00:00.000Z
Canonical: https://millsymills.com/.well-known/security.txt
Preferred-Languages: en
```

Calendar reminder for expiry refresh — Terraform auto-rolling is premature.

**S3/CloudFront:** no infra change needed. `aws s3 sync dist/ s3://...` (per `.github/workflows/deploy.yml`) already handles `/.well-known/` and ASCII files.

### #43 — `/privacy/` page

**Files added**

- `src/components/desktop/apps/Privacy.astro`
- `src/data/privacy-copy.ts` — prose broken into named sections so the component is layout-only

**Files modified**

- `src/data/apps.ts` — new entry `id: 'privacy'`, `glyph: '🔒'`, `title: 'privacy.txt'`, `label: 'privacy'`, reasonable geometry (`x: 200, y: 140, width: 620, height: 520`)
- `src/scripts/terminal/commands/basic.ts` — register `privacy` command: prints TL;DR + `open https://millsymills.com/privacy/`

**Content sections** (rendered as stacked headers + paragraphs, not `<details>` — reading flow is linear)

1. **what we collect** — nothing. no analytics, no cookies, no fingerprinting, no tag managers, no third-party scripts
2. **what's on the wire** — self-hosted fonts, CloudFront assets, this page. zero third-party requests
3. **localStorage keys** — explicit list with purpose:
   - `mills.desktop.v1` — open windows, positions, last-open app
   - `mills.flags.v1` — captured CTF flags
   - `mills.mobile.v1` — mobile-shell state
   - `mills.boot.played` — "played boot sequence already" flag

   **Honesty constraint:** this list MUST describe what actually exists at deploy time. The vscode `mills.vscode.v1` key only gets added to `privacy-copy.ts` in PR 6 when vscode.exe itself ships. Until then, the privacy page does not list it.
4. **server logs** — CloudFront standard access logs v2 → S3, retention 90 days (per `infra/s3.tf`), no PII
5. **bots / AI** — links to `/robots.txt` + CF Content-Signals
6. **license + source** — MIT, GitHub URL, "fork it, run your own"
7. **attestation footer** — `served from commit <short-sha>` pulled from `PUBLIC_GIT_SHA` — monospace small-text block

**Google Fonts self-hosting** — additive tasks in the same PR:

- Download Inter + VT323 WOFF2 to `public/fonts/`
- Update `@font-face` rules in `src/styles/` (replace Google Fonts `<link>` with self-hosted CSS)
- Remove `<link rel="preconnect">` to `fonts.googleapis.com` / `fonts.gstatic.com` from the layout
- Update the CSP in CloudFront / Astro integration (remove `fonts.googleapis.com` and `fonts.gstatic.com` from `font-src` and `style-src`)
- Verify no other site surfaces pull Google-hosted fonts

**CloudFront log retention** — audited during plan-writing: `infra/s3.tf:127-144` sets 90-day expiration on the logs bucket. Privacy page copy says 90 days to match reality.

**`privacy` command output**

```
$ privacy
tl;dr — no tracking, no cookies, no third-party scripts.
- localStorage + sessionStorage only (window positions, flag progress, boot flag)
- CloudFront access logs — 90d retention (ip, ua, url, status, timestamp)
- MIT licensed, source on GitHub

full policy:  https://millsymills.com/privacy/
```

### #44 — `/incidents/` wall

**Files added**

- `src/components/desktop/apps/Incidents.astro`
- `src/data/incidents.ts` — typed list

**Files modified**

- `src/data/apps.ts` — entry `id: 'incidents'`, `glyph: '🚨'` (or pick from icon pack), `title: 'incidents.log'`, `label: 'incidents'`, geometry `x: 260, y: 120, width: 640, height: 560`
- `src/scripts/terminal/commands/basic.ts` — register `incidents` command

**Data shape**

```ts
export interface Incident {
  year: number;
  severity: 'info' | 'low' | 'med' | 'high' | 'critical';
  cve?: string;
  title: string;
  annotation: string;
  link?: { label: string; href: string };
}
export const incidents: Incident[];  // sorted descending by year
```

**Layout**

Header: a small hex-dump decoration block (8 lines max), purely chrome.

Timeline: vertical list of cards, newest first. Each card:

- Year badge (left column, monospace)
- Severity pill (color-coded: `info`=cyan, `low`=green, `med`=yellow, `high`=orange, `critical`=magenta) — reuse existing site palette tokens
- Title (monospace)
- CVE ID (small monospace, if present)
- Annotation (one paragraph)
- Optional external link rendered as `> full writeup →` affordance

Mobile: cards stack full-width, no layout change.

**`incidents` command output**

```
$ incidents
2024  HIGH      Zoom RCE 0-day — custom mitigation 8h before vendor
2023  CRITICAL  ELUSIVE COMET — Zoom remote-control hardening
...

`incidents <year>` filters to that year.
```

Severity is color-coded using existing terminal classes (`t-err`, `t-warn`, etc.).

### #45 — `vscode.exe` app

**Files added**

- `src/components/desktop/apps/VSCode.astro` — shell markup + scoped styles
- `src/scripts/vscode/` (new subtree):
  - `index.ts` — entry; wires together sidebar + tabs + editor; reads `virtualFs`
  - `state.ts` — localStorage persistence (`mills.vscode.v1`)
  - `file-tree.ts` — render collapsible tree from `virtualFs`
  - `tabs.ts` — tab strip: render + close + switch
  - `editor.ts` — plain-text renderer with line-number gutter
- `src/styles/vscode.css` — scoped styles using existing design tokens

**Files modified**

- `src/data/apps.ts` — entry `id: 'vscode'`, `glyph: '🆅'` (or icon pack), `title: 'vscode.exe'`, `label: 'vscode'`, generous geometry `x: 140, y: 80, width: 900, height: 620`
- `src/data/privacy-copy.ts` — add `mills.vscode.v1` to the localStorage-keys section (keeps the privacy page accurate once vscode.exe actually writes to storage)

**Layout (desktop)**

```
┌─────┬──────────────┬───────────────────────────────────┐
│ [F] │ ▾ project    │ [index.astro×] [.zshrc×] │        │
│ [S] │   README.md  ├───────────────────────────────────┤
│ [G] │   resume.md  │  1  ---                           │
│ [D] │ ▾ src        │  2  import Layout from ...        │
│ [E] │    data/...  │  3  ...                           │
│     │ ▾ home/mills │                                   │
│     │    .zshrc    │                                   │
│     │    ...       │                                   │
│     ├──────────────┴───────────────────────────────────┤
│     │ ⎇ main · a1b2c3d · Ln 1, Col 1 · UTF-8 · text    │
└─────┴──────────────────────────────────────────────────┘
  48px      220px                 fills                22px
```

- Activity bar (48px): Files icon active; Search/SCM/Debug/Ext rendered but inert — tooltip "v1 — coming soon"
- Sidebar (220px, non-resizable v1): expand/collapse folders, click file = open in tab + activate
- Tab strip: open tabs left-aligned; × to close; middle-click to close (optional, nice-to-have); clicking a tab activates; active tab styled with pink accent
- Editor: monospace, line-number gutter, plain text
- Status bar: `⎇ main`, short SHA (7 chars) from `PUBLIC_GIT_SHA`, `Ln N, Col N`, `UTF-8`, `{language}` (from virtual-fs hint, defaults to `plain text`)

**Layout (mobile, ≤ 768px)**

2-pane stacked:
- Top (~40% height): scrollable flat file list (no tree — easier to tap)
- Bottom (~60% height): active file's content

Status bar hidden on mobile; activity bar hidden.

**Persistence**

- Storage key: `mills.vscode.v1`
- Shape: `{ version: 1, openTabs: string[], activeTab: string | null }`
- Write: debounced 200ms on every mutation
- Read: on mount; if parse fails or version mismatches, reset to empty state
- `try/catch` around all storage access — private-mode browsers degrade to stateless

**Files visible in the tree**

Curated subset of `virtualFs` plus a root-level `project/` alias showing real repo files as committed snippets:

```
project/
  README.md            ← new, /src/data/vscode-readme-teaser.md, ~10 lines
  resume.md            ← existing /files/resume.md contents
  src/
    data/apps.ts       ← first 40 lines of real file
    pages/index.astro  ← first 40 lines of real file
  home/mills/
    .zshrc             ← real content from virtualFs (#41)
    .tmux.conf         ← same
    .config/nvim/init.lua
    .config/git/config
    .dotfiles/README.md
  etc/
    motd
    hosts
```

**Snippet drift mitigation** — `scripts/check-vfs-snippets.sh` (optional, small): diffs each snippet's string against the first N lines of its real source file; fails CI if mismatched without a flag. Skip if it proves annoying; eyeballing is fine for a v1 of this scope.

**Privacy:** `priv: true` entries (`/etc/shadow`) are filtered out when building the VS Code tree. They remain visible only via terminal `sudo cat`.

**Persistence cap:** the tab array is capped at a sane limit (say 20) so a runaway loop can't balloon localStorage. Excess tabs are dropped oldest-first on load.

## Data flow summary

```
virtualFs (src/data/virtual-fs.ts)
  ├──→ filesystem.ts (terminal adapter)
  │     └──→ terminal commands (ls, cat, dotfiles)
  └──→ vscode file-tree.ts
        └──→ editor.ts (plain text)

pgp.ts (src/data/pgp.ts)
  ├──→ About.astro (keys block)
  ├──→ Mail.astro (fingerprint next to email)
  └──→ pubkey command
public/pgp.asc + WKD path + security.txt ← served directly by CloudFront

incidents.ts (src/data/incidents.ts)
  ├──→ Incidents.astro (card timeline)
  └──→ incidents command

privacy-copy.ts
  └──→ Privacy.astro

PUBLIC_GIT_SHA (build-time env)
  ├──→ Privacy.astro (attestation footer)
  └──→ VSCode.astro (status bar)
```

## Error handling / edge cases

- **localStorage unavailable** — every persistence call wrapped in `try/catch`; UI degrades to stateless
- **Missing `PUBLIC_GIT_SHA`** — fallback to `'unknown'`; UI always renders
- **Missing dotfile content** — placeholder stub `# not yet published — see <repo>` with `TODO(mills)` in source + tracking issue; never a fabricated config
- **PGP WKD rotation** — helper script regenerates binary + hash; no runtime check needed
- **Empty incident fields** — optional `link` and `cve` conditionally render; missing = no chrome
- **VS Code opens a `priv` file** — filtered at tree-build time; never visible in VS Code
- **VS Code tab overflow** — cap at 20 open tabs; drop oldest-first on load
- **VS Code snippet drift** — optional lint script; manual review otherwise

## Testing strategy

The repo's testing convention is smoke: `npm run check` for type coverage, manual browser verification for UX. Preserving that.

**Per-PR checks**

- `npm run check` clean
- `npm run build && npm run preview` — new routes resolve, OG images generate
- Manual smoke in Chrome + mobile viewport (iPhone 13)
- Terminal smoke for any new commands

**Optional: one unit test file**

`tests/virtual-fs.test.ts` (new, Vitest):
- asserts expected paths exist
- asserts no `priv: true` entries leak into the VS Code tree builder

If adding Vitest is non-trivial, skip. The manual filter check is reliable.

## Ship order

One worktree (`.worktrees/phase-5c-batch/`), six branches, all off `main`. Spec itself lands first via a doc-only PR so downstream branches share it:

| Order | Branch | Issue | Depends on | Blocked by input |
|---|---|---|---|---|
| 0 | `docs/phase-5c-batch-spec` | — | — | — |
| 1 | `phase-5c/shared-virtual-fs` | — (infra) | 0 | — |
| 2 | `phase-5c/41-dotfiles` | #41 | 1 | A |
| 3 | `phase-5c/43-privacy` | #43 | 1 | — |
| 4 | `phase-5c/44-incidents` | #44 | 1 | C |
| 5 | `phase-5c/42-pgp` | #42 | 1 | B |
| 6 | `phase-5c/45-vscode` | #45 | 1, 2 | A |

PRs 1, 3 can merge immediately. PRs 2, 4, 5, 6 stage behind their input. Each branch off fresh `main` after dependencies land.

## Open questions

None.

## Related

- Existing spec patterns: `docs/superpowers/specs/2026-04-19-p41m0n-dress-rehearsal-design.md`, `docs/superpowers/specs/2026-04-20-clippy-companion-design.md`, `docs/superpowers/specs/2026-04-20-icon-pack-wire-up-design.md`
- Issues: #41, #42, #43, #44, #45
