# ─── PATH hygiene ────────────────────────────────────────
# Dedupe PATH entries automatically — prevents re-source accumulation.
typeset -U path PATH

# Cache brew prefix (saves ~300ms on startup: called 4x below).
BREW_PREFIX="$(brew --prefix)"

# ─── Tool initialization ─────────────────────────────────
# starship: single-config fish-quality prompt across shells; lighter than p10k
eval "$(starship init zsh)"
# zoxide: fuzzy-jump `z <dir>` trained by frecency; replaces most `cd` typing
eval "$(zoxide init zsh)"
# atuin: searchable shell history in SQLite, replaces Ctrl-R with a fuzzy TUI
eval "$(atuin init zsh)"
source "$BREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
source "$BREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# ─── Shell options ───────────────────────────────────────
setopt AUTO_CD              # type a dir name to cd into it
setopt INTERACTIVE_COMMENTS # allow # comments at the prompt
setopt EXTENDED_HISTORY     # timestamped history entries
setopt HIST_IGNORE_DUPS     # no consecutive duplicate commands
setopt HIST_IGNORE_SPACE    # commands starting with space stay out of history
setopt HIST_REDUCE_BLANKS   # normalize whitespace before storing
setopt NO_CLOBBER           # > won't overwrite existing files; use >| to force

# ─── Completion ──────────────────────────────────────────
autoload -Uz compinit && compinit -C
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"

# ─── Modern-tool aliases ─────────────────────────────────
# NOTE: aliasing grep/find changes interactive semantics — pasted commands
# from docs may behave differently. Only affects interactive shells.
alias ls='eza --icons'            # modern ls — colors, git status, icons
alias ll='eza -la --icons --git'
alias cat='bat --paging=never'    # syntax-highlighted cat, no auto-pager
alias grep='rg'                   # ripgrep — respects .gitignore, parallelized
alias find='fd'                   # fd — user-friendly find syntax
alias rm='trash'                  # macOS Trash, not oblivion — "no rm -rf" rule
alias python=python3

# ─── fzf + bat preview ───────────────────────────────────
# `fd` feeds fzf; bat provides the inline preview on Ctrl-T.
export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'
export FZF_CTRL_T_OPTS="--preview 'bat --color=always --line-range :500 {}'"

# fzf key bindings (Ctrl+T file picker, Alt+C cd picker, **<Tab> fuzzy complete).
# atuin already owns Ctrl+R for history search.
[ -f "$BREW_PREFIX/opt/fzf/shell/key-bindings.zsh" ] && source "$BREW_PREFIX/opt/fzf/shell/key-bindings.zsh"
[ -f "$BREW_PREFIX/opt/fzf/shell/completion.zsh" ]   && source "$BREW_PREFIX/opt/fzf/shell/completion.zsh"

# ─── Google Cloud SDK ────────────────────────────────────
# Homebrew install — single source of truth. If you ever switch to the
# Google installer ($HOME/google-cloud-sdk/), update these two paths.
if [ -f "$BREW_PREFIX/share/google-cloud-sdk/path.zsh.inc" ]; then
  source "$BREW_PREFIX/share/google-cloud-sdk/path.zsh.inc"
fi
if [ -f "$BREW_PREFIX/share/google-cloud-sdk/completion.zsh.inc" ]; then
  source "$BREW_PREFIX/share/google-cloud-sdk/completion.zsh.inc"
fi

# ─── gam (Google Apps Manager) ───────────────────────────
# gam7 is the modern rewrite of gam — shim to the specific binary so
# `gam --version` always reports from the right install even if PATH drifts.
alias gam="/home/mills/bin/gam7/gam"

# ─── pnpm ────────────────────────────────────────────────
# pnpm over npm/yarn: content-addressable store, no node_modules duplication.
export PNPM_HOME="$HOME/Library/pnpm"
path=("$PNPM_HOME" $path)

# ─── Claude Code ─────────────────────────────────────────
# Keep cwd consistent between bash tool calls and the prompt — otherwise
# `cd` in one call doesn't carry to the next. DISABLE_TELEMETRY is a personal
# default; remove if you want to help Anthropic's usage stats.
export DISABLE_TELEMETRY=1
export CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1

# cc: jump to a project dir and launch Claude Code there
cc() { cd "${1:-.}" && claude; }

# ─── 1Password SSH agent ─────────────────────────────────
# Route SSH through 1Password when the desktop app is running. The socket
# is absent on boot until the app starts, so guard with `-S`.
_OP_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
[ -S "$_OP_SOCK" ] && export SSH_AUTH_SOCK="$_OP_SOCK"
unset _OP_SOCK

# ─── uv / pipx bin ───────────────────────────────────────
# uv manages fast Python virtualenvs; this env file adds its shim dir and
# ~/.local/bin (used by pipx-installed CLI tools).
. "$HOME/.local/bin/env"

# ─── opencode ────────────────────────────────────────────
# opencode — local-first AI coding CLI, pairs with Claude Code for non-network work.
path=("$HOME/.opencode/bin" $path)

# ─── direnv ──────────────────────────────────────────────
# Auto-load/unload per-project .envrc files on cd. Security-conscious:
# direnv refuses to load until you `direnv allow` the file explicitly.
eval "$(direnv hook zsh)"
