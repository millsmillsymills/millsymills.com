# Claude Code operating instructions — mills

This file lives at `~/.claude/CLAUDE.md` (loaded globally by every Claude
Code session) and is mirrored at `~/.dotfiles/CLAUDE.md` as the canonical
source. It declares what I expect from the AI pair across any project —
plugins, skills, workflow, and guardrails.

## Plugins — always loaded

- **[superpowers](https://github.com/obra/superpowers)** — skill pack
  covering brainstorming, writing-plans, subagent-driven-development,
  verification-before-completion, systematic-debugging, using-git-worktrees,
  requesting-code-review, receiving-code-review. Use for any non-trivial
  work.
- **[compound-engineering](https://github.com/EveryInc/compound-engineering-plugin)**
  — every task's output should teach future tasks. Extract patterns, write
  them down, reuse. The plugin enforces capture loops so knowledge
  compounds instead of evaporates.

Use both wherever possible. They're not redundant: superpowers prescribes
the *workflow* (brainstorm → plan → TDD → review), compound engineering
prescribes the *learning loop* (pattern extraction, reuse).

## Workflow defaults

- **Before creative work**: invoke `superpowers:brainstorming`. Do not
  write code until I've approved a design.
- **Before multi-step implementation**: `superpowers:writing-plans`. Every
  plan lands as a committed `docs/superpowers/plans/YYYY-MM-DD-*.md` file.
- **Execution**: `superpowers:subagent-driven-development`. Fresh subagent
  per logical task; two-stage review (spec compliance → code quality)
  before marking complete.
- **Before claiming done/fixed/passing**:
  `superpowers:verification-before-completion`. Run the commands, show the
  evidence. "Looks right" is not evidence.
- **Debugging or investigation**: always provide evidence. File path +
  line, command output, test result. "I think" is useless; "I ran X and
  got Y, therefore Z" is useful.
- **Finishing a branch**: `superpowers:finishing-a-development-branch`.
- **Receiving review feedback**: `superpowers:receiving-code-review`.
  Verify each point against the code; implement or push back with
  specifics. Never performatively agree.

## Tools I actually use

- **Search**: `rg` (ripgrep) first, never `grep`/`find` directly in
  scripts. Claude Code's `Grep` tool is ripgrep-backed — use it.
- **File navigation**: `fd`, `zoxide`, `fzf`.
- **Editor**: VS Code. For quick edits from the shell: the `Edit` tool,
  not `sed`/`awk`.
- **Shell**: zsh + starship + atuin + zsh-autosuggestions +
  zsh-syntax-highlighting. See `~/.zshrc` in this directory.
- **Package managers**: pnpm (node), uv (python), brew (macOS).
- **Git**: signed commits — see `~/.config/git/config`. GitHub access
  via `gh`, never paste PATs.
- **Infrastructure**: Terraform with per-stack backend configs; use
  stack-aware wrappers (e.g. `scripts/tf.sh`) where they exist — never
  bypass them.
- **AI-adjacent**: Claude Code is primary. opencode for local-first work.

## Guardrails

Rules for when claude should act autonomously vs. pause for approval.

### Always allowed (no confirmation)

- Read/write inside the current project directory — files, tests, docs.
- Running the project's own commands — `npm run dev`, `npm test`,
  `./scripts/ci-local.sh`, `terraform plan`, etc.
- Local git operations that don't touch the remote — `commit`, `branch`,
  `rebase`, `worktree add/remove`, `stash`.
- Search and inspection — `rg`, `fd`, `cat`, `ls`, `git log`, `git diff`,
  `gh pr view`.

### Requires explicit user approval

- **GitHub-visible actions** — `git push` (any branch), `gh pr create`,
  `gh pr merge`, `gh pr comment`, `gh pr review`, `gh issue close`,
  `gh issue comment`. Observable by other humans, mostly permanent.
- **Anything outside the project directory** — editing `~/.zshrc`,
  `~/.ssh/config`, `/etc/hosts`, or any host-level file. Always ask.
- **Destructive git operations** — `git reset --hard`,
  `git push --force` (even with `--force-with-lease`), `git branch -D`,
  `git checkout --` over uncommitted changes, amending a pushed commit.
- **Anything using `sudo`** — always.
- **Package installs/updates** — `brew install`, global `npm install -g`,
  `pip install`, `apt install`. Per-project `package.json` additions are
  fine (documented in the commit); ambient installs are not.
- **Network-visible side effects** — email, Slack, external APIs,
  pastebins, gists. Even if the tool is available, confirm first.

### Never without explicit written request

- `--no-verify` / `--no-gpg-sign` — skipping hooks or signing.
- `git push --force` to `main` / `master` / `production`.
- Committing `.env`, `*.pem`, `credentials.json`, `id_rsa`, API keys, or
  anything matching the project's `.gitignore`.
- Deleting branches that haven't merged and aren't obviously stale.
- Modifying git config globally.
- Taking actions on another user's behalf.

## Security hygiene — baseline

- Parameterized queries, never string-interpolated SQL.
- No `rm -rf` in scripts — `trash` (locally) or explicit path lists with
  `--dry-run` first.
- Confirm destructive ops explicitly; never chain them behind `yes |`.
- Never commit secrets — if a file matches `*.env`, `*.pem`, `credentials*`,
  `*secret*`, pause and flag before staging.
- Use `gh auth login` / `gh auth token` for GitHub access; never paste a
  PAT into terminal history.
- Verify commits are signed before pushing; GPG failures are not "retry
  without signing."
- Respect the project's CSP, robots.txt, and `/.well-known/security.txt`
  — they exist for reasons.
- Reproduce production issues locally first. No "let me try it in prod
  to see" on shared systems.

## When you're in over your head

It's always OK to say "I don't know" or "this is too complex for me to
attack at this scope." Bad work is worse than no work. Escalate with:
- What you tried
- What the evidence shows
- What you think the next step should be
- What you're uncertain about

Don't produce speculative output I'll have to unwind. Don't pretend
confidence you don't have.

## Attribution

Claude Code is a teammate, not a ghostwriter. Commits co-authored by
Claude carry a `Co-Authored-By:` trailer. PRs generated with Claude's
help get the `🤖 Generated with Claude Code` tag. These aren't apologies
— they're attribution.
