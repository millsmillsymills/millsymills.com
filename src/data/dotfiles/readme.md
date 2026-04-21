# mills's dotfiles

what's here, publicly mirrored from my laptop:
  .zshrc                starship prompt, atuin history, eza/bat/fd/rg/fzf
  .config/git/config    signed commits, autosquash, zdiff3 merges
  CLAUDE.md             claude-code operating instructions (plugins, guardrails)

what's not:
  .tmux.conf            don't use tmux — extra-terminal panes, not intra-terminal
  nvim/init.lua         primary editor is vscode (see vscode.exe), not vim

philosophy: small, portable, explicit. no plugin manager needed for zsh —
brew handles tool installs; .zshrc just wires them up. git signs everything.
tools are modern where it matters (starship, atuin, eza, ripgrep), classic
where it doesn't.

the CLAUDE.md file is the interesting one. it's the operating contract
between me and claude-code — plugins I always load (superpowers +
compound-engineering), workflow defaults (brainstorm → plan → TDD → review),
and guardrails (what claude can do autonomously vs what needs my approval).

no bootstrap script (yet). these live on my laptop and this fake filesystem
is the public mirror.

source of truth: github.com/millsmillsymills/millsymills.com/blob/main/src/data/dotfiles/

MIT. fork it if any of this sparks joy.
