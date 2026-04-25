// AI-native CLI stack — tools mills and claude-code both consume.
//
// Distinct from ./uses.ts (hardware + physical gear). The through-line
// here: every tool is chosen for machine-parseable output, deterministic
// behavior, or agent-safe auth. Agents and humans consume the same
// interfaces, which is why the stack works.
//
// Terminal command `tools` renders the overview; `tools <id>` prints
// the per-tool detail. The /uses/ app page renders the full list.

export type ToolCategory =
	| 'basics'
	| 'agent-native'
	| 'environment'
	| 'ai-coding'
	| 'security'
	| 'editor-infra';

export interface ToolExample {
	readonly cmd: string;
	readonly description: string;
}

export interface Tool {
	/** terminal lookup key (lowercase, no spaces) — used by `tools <id>` */
	readonly id: string;
	/** display name, e.g. 'ripgrep (rg)' */
	readonly name: string;
	readonly category: ToolCategory;
	/** one-line description, <= ~70 chars — shown in `tools` overview */
	readonly tagline: string;
	/** install command (optional, shown in detail view) */
	readonly install?: string;
	/** canonical docs URL */
	readonly docsUrl?: string;
	/**
	 * aliases from .zshrc that mask this tool (e.g. grep→rg). Strings are
	 * display-friendly: parenthetical decoration is allowed (e.g.
	 * `'grep (aliased)'`) and `findTool` matches only the leading bare token,
	 * so both `tools grep` and `tools rg` resolve to ripgrep.
	 */
	readonly aliases?: readonly string[];
	/** bullets explaining why this tool fits an AI-native stack */
	readonly aiRationale: readonly string[];
	/** common usage examples */
	readonly examples?: readonly ToolExample[];
	/** mills's personal take (optional) */
	readonly note?: string;
}

export const toolCategoryTitles: Record<ToolCategory, string> = {
	basics: 'machine-parseable basics',
	'agent-native': 'agent-native clis',
	environment: 'deterministic environment',
	'ai-coding': 'ai coding',
	security: 'security + auth',
	'editor-infra': 'editor + infra',
};

/** Canonical render order for categories — shared by Uses.astro + terminal. */
export const toolCategoryOrder: readonly ToolCategory[] = [
	'basics',
	'agent-native',
	'environment',
	'ai-coding',
	'security',
	'editor-infra',
];

export const tools: readonly Tool[] = [
	// ─── basics ──────────────────────────────────────────
	{
		id: 'ripgrep',
		name: 'ripgrep (rg)',
		category: 'basics',
		tagline: 'machine-parseable grep; respects .gitignore; 10-100x faster on trees',
		install: 'brew install ripgrep',
		docsUrl: 'https://github.com/BurntSushi/ripgrep',
		aliases: ['rg', 'grep (aliased)'],
		aiRationale: [
			'--json emits structured records per match; trivially parseable, no screen-scraping',
			'respects .gitignore by default — agents don\'t burn context on node_modules/.venv/dist',
			'parallelized across files; massive speedups on repo-wide searches',
			'smart-case default means agents don\'t guess when to flag -i',
		],
		examples: [
			{ cmd: 'rg \'pattern\'', description: 'search current tree' },
			{ cmd: 'rg -t ts \'useEffect\'', description: 'restrict by file type' },
			{ cmd: 'rg --json \'err\' | jq', description: 'machine-parseable output' },
			{ cmd: 'rg -l \'TODO\'', description: 'just the matching filenames' },
		],
		note: 'claude-code\'s Grep tool is ripgrep-backed — when I ask claude to "grep the repo," it\'s rg running, not posix grep.',
	},
	{
		id: 'fd',
		name: 'fd',
		category: 'basics',
		tagline: 'user-friendly find with sane defaults and predictable output',
		install: 'brew install fd',
		docsUrl: 'https://github.com/sharkdp/fd',
		aliases: ['fd', 'find (aliased)'],
		aiRationale: [
			'predictable defaults — skips hidden + .gitignored files without flags',
			'no shell-quoting footguns: agents don\'t have to escape glob metacharacters',
			'--exec safer than find\'s for agent scripts; always one-per-match',
		],
		examples: [
			{ cmd: 'fd \'.ts$\'', description: 'find .ts files in tree' },
			{ cmd: 'fd -e md -H', description: 'all markdown files including hidden' },
			{ cmd: 'fd -x bat {}', description: 'preview each match via bat' },
		],
	},
	{
		id: 'bat',
		name: 'bat',
		category: 'basics',
		tagline: 'cat with syntax highlighting + git-diff markers',
		install: 'brew install bat',
		docsUrl: 'https://github.com/sharkdp/bat',
		aliases: ['bat', 'cat (aliased with --paging=never)'],
		aiRationale: [
			'consistent --paging=never mode for scripts — no TTY-interactive surprises',
			'shows git diff markers inline, which agents reading diff output can consume',
			'language auto-detection by extension; stable output format across file types',
		],
		examples: [
			{ cmd: 'bat README.md', description: 'rendered with syntax highlighting' },
			{ cmd: 'bat --style=plain file.ts', description: 'no git markers, no line numbers' },
			{ cmd: 'bat -A file.txt', description: 'show non-printing chars (ideal for agent debugging)' },
		],
	},
	{
		id: 'eza',
		name: 'eza',
		category: 'basics',
		tagline: 'modern ls with git status + icons; --colour=never for diffable output',
		install: 'brew install eza',
		docsUrl: 'https://github.com/eza-community/eza',
		aliases: ['eza', 'ls (aliased)', 'll'],
		aiRationale: [
			'--colour=never produces deterministic output agents can diff across runs',
			'--git column exposes per-file git status inline; one syscall instead of ls + git status',
			'--tree produces structured listings agents can parse for directory layout',
		],
		examples: [
			{ cmd: 'eza -la --git', description: 'ls + git status together' },
			{ cmd: 'eza --tree --level=2', description: 'two-level directory tree' },
		],
	},
	{
		id: 'zoxide',
		name: 'zoxide',
		category: 'basics',
		tagline: 'cd replacement trained on frecency; jump with `z <partial>`',
		install: 'brew install zoxide',
		docsUrl: 'https://github.com/ajeetdsouza/zoxide',
		aliases: ['z', 'zi'],
		aiRationale: [
			'frecency-trained jumps are deterministic within a session — agents resolve `z site` consistently',
			'works cross-session via a SQLite database; agent context on directory preference persists',
		],
		examples: [
			{ cmd: 'z site', description: 'jump to most-used dir matching "site"' },
			{ cmd: 'zi', description: 'interactive fzf picker over history' },
		],
	},
	// ─── agent-native ────────────────────────────────────
	{
		id: 'gh',
		name: 'GitHub CLI (gh)',
		category: 'agent-native',
		tagline: 'json output for every subcommand; the agent-first GitHub client',
		install: 'brew install gh',
		docsUrl: 'https://cli.github.com/',
		aiRationale: [
			'every read subcommand has --json + --jq; structured output end-to-end',
			'auth lives in the system keychain, never in terminal history',
			'OAuth device-flow login means no PAT copy-paste',
			'PR / issue / workflow operations scriptable in agent loops without browser context',
		],
		examples: [
			{ cmd: 'gh pr list --json number,title,state', description: 'structured PR data for piping' },
			{ cmd: 'gh pr view 107 --json mergeable', description: 'check mergeability in a script' },
			{ cmd: 'gh run watch', description: 'block until workflow finishes' },
		],
		note: 'claude-code\'s own Bash tool uses gh for every github operation in this session — PR creation, merging, issue filing. It\'s the reason I can say "file an issue about X" and it just happens.',
	},
	{
		id: 'jq',
		name: 'jq',
		category: 'agent-native',
		tagline: 'json processor; the glue between every agent-native tool',
		install: 'brew install jq',
		docsUrl: 'https://jqlang.github.io/jq/',
		aiRationale: [
			'deterministic structured transforms on JSON agents emit/consume',
			'composable: `gh pr list --json ... | jq \'...\'` is the standard agent pattern',
			'error output is specific enough for agents to self-correct queries',
		],
		examples: [
			{ cmd: 'gh pr list --json number | jq -r \'.[].number\'', description: 'extract just PR numbers' },
			{ cmd: 'jq \'.data[] | select(.status == "open")\'', description: 'filter by field' },
		],
	},
	{
		id: 'fzf',
		name: 'fzf',
		category: 'agent-native',
		tagline: 'fuzzy finder with scriptable --filter mode for non-interactive use',
		install: 'brew install fzf',
		docsUrl: 'https://github.com/junegunn/fzf',
		aliases: ['fzf'],
		aiRationale: [
			'--filter makes fzf scriptable — agents can compose fuzzy match into larger flows',
			'--preview evaluates arbitrary commands per-match; bat integrates natively',
			'deterministic ranking means an agent\'s next call against same inputs gets the same result',
		],
		examples: [
			{ cmd: 'rg -l TODO | fzf', description: 'interactive picker over files with TODOs' },
			{ cmd: 'echo "$OPTIONS" | fzf --filter query', description: 'non-interactive fuzzy match' },
		],
	},
	{
		id: 'atuin',
		name: 'atuin',
		category: 'agent-native',
		tagline: 'shell history in queryable SQLite; replaces Ctrl-R with a fuzzy TUI',
		install: 'brew install atuin',
		docsUrl: 'https://atuin.sh/',
		aiRationale: [
			'history in SQLite, not a flat text file — agents can query past commands by exit code, cwd, hostname',
			'sync between machines means the same history surface across every workstation agents touch',
			'opt-in encryption for the sync backend',
		],
		examples: [
			{ cmd: 'atuin search --limit 10 git', description: 'query history for git-* commands' },
			{ cmd: 'atuin stats', description: 'see your own shell usage patterns' },
		],
	},
	// ─── environment ─────────────────────────────────────
	{
		id: 'uv',
		name: 'uv',
		category: 'environment',
		tagline: 'fast python package manager with lockfile-driven reproducibility',
		install: 'brew install uv',
		docsUrl: 'https://github.com/astral-sh/uv',
		aiRationale: [
			'10-100x faster than pip; agent-driven environment scaffolding becomes practical',
			'lockfile-driven, so an agent producing a uv.lock in one session can hand it to another and get identical installs',
			'drop-in resolver compatible with pip requirements',
		],
		examples: [
			{ cmd: 'uv venv && uv pip install -r requirements.txt', description: 'new venv + reproducible install' },
			{ cmd: 'uv run script.py', description: 'run in managed environment' },
		],
	},
	{
		id: 'pnpm',
		name: 'pnpm',
		category: 'environment',
		tagline: 'content-addressable node package manager; no node_modules duplication',
		install: 'brew install pnpm',
		docsUrl: 'https://pnpm.io/',
		aiRationale: [
			'deterministic lockfile; agents across sessions produce byte-identical trees',
			'content-addressable store means disk usage scales with unique deps, not repo count',
			'strict by default — prevents phantom deps that agents hallucinate',
		],
	},
	{
		id: 'direnv',
		name: 'direnv',
		category: 'environment',
		tagline: 'per-project .envrc auto-loaded on cd; security-conscious opt-in',
		install: 'brew install direnv',
		docsUrl: 'https://direnv.net/',
		aiRationale: [
			'per-project environment means agents don\'t re-negotiate env vars per shell call',
			'refuses to load .envrc until you `direnv allow` — agent-executed `cd` into a new dir can\'t auto-exfiltrate via planted .envrc',
			'integrates with nix, uv, asdf — tool-manager-agnostic',
		],
		examples: [
			{ cmd: 'echo \'export API_URL=...\' > .envrc && direnv allow', description: 'scope env to this dir' },
		],
	},
	// ─── ai-coding ───────────────────────────────────────
	{
		id: 'claude-code',
		name: 'Claude Code',
		category: 'ai-coding',
		tagline: 'primary AI pair programmer; this site was built with it',
		docsUrl: 'https://claude.com/claude-code',
		aiRationale: [
			'the tool-using agent is the product, not a bolt-on; read/write/run-commands are first-class',
			'subagent dispatch + task isolation means complex work stays scoped',
			'plugin ecosystem: superpowers (workflow), compound-engineering (learning loop)',
		],
		note: 'See ~/.dotfiles/CLAUDE.md for the operating contract between me and claude-code — plugins, guardrails, workflow defaults.',
	},
	{
		id: 'superpowers',
		name: 'superpowers (plugin)',
		category: 'ai-coding',
		tagline: 'skill pack: brainstorm → plan → TDD → review workflow for claude-code',
		docsUrl: 'https://github.com/obra/superpowers',
		aiRationale: [
			'enforces the workflow before any code: brainstorming before creative work, plans before multi-step implementation',
			'two-stage review (spec compliance + code quality) catches the "looks right but isn\'t" class of bugs',
			'shared skills across sessions means my past self and my future self agree on process',
		],
	},
	{
		id: 'compound-engineering',
		name: 'compound-engineering (plugin)',
		category: 'ai-coding',
		tagline: 'enforces the learning loop — every task teaches future tasks',
		docsUrl: 'https://github.com/EveryInc/compound-engineering-plugin',
		aiRationale: [
			'extracts patterns from sessions and writes them down so knowledge compounds instead of evaporates',
			'pairs with superpowers: superpowers prescribes workflow, compound-eng prescribes the meta-loop',
		],
	},
	{
		id: 'opencode',
		name: 'opencode',
		category: 'ai-coding',
		tagline: 'local-first AI coding CLI; offline/private fallback',
		docsUrl: 'https://opencode.ai/',
		aiRationale: [
			'local-first means sensitive work never leaves the machine',
			'complements claude-code for work that can\'t round-trip to a cloud model',
		],
	},
	// ─── security ────────────────────────────────────────
	{
		id: '1password',
		name: '1Password (SSH agent)',
		category: 'security',
		tagline: 'routes SSH through the desktop app; keys never leave the 1Password vault boundary',
		docsUrl: 'https://developer.1password.com/docs/ssh/',
		aiRationale: [
			'agent-executed ssh/git-push never handles raw private keys — the 1P socket mediates every auth',
			'biometric unlock for every signing operation; agents can\'t push sig-requiring commits without my fingerprint',
			'keys are per-vault scoped; least-privilege is the default',
		],
	},
	{
		id: 'gpg',
		name: 'GnuPG (gpg)',
		category: 'security',
		tagline: "commit signing + WKD key publication for mills' identity",
		install: 'brew install gnupg',
		docsUrl: 'https://www.gnupg.org/',
		aiRationale: [
			'signed commits: any agent-produced commit either signs with my key or fails — no silent author forgery',
			'WKD publication at /.well-known/openpgpkey/ means downstream verifiers auto-discover the key',
		],
		examples: [
			{ cmd: 'gpg --locate-keys --auto-key-locate wkd <maintainer-email>', description: 'fetch + verify my key via WKD (substitute the address from /mail/)' },
			{ cmd: 'git commit -S -m ...', description: 'signed commit (default with commit.gpgsign=true)' },
		],
	},
	// ─── editor-infra ────────────────────────────────────
	{
		id: 'vscode',
		name: 'VS Code',
		category: 'editor-infra',
		tagline: 'primary human editor; claude-code writes into the same tree via Edit tool',
		docsUrl: 'https://code.visualstudio.com/',
		aiRationale: [
			'file watcher + live reload means claude\'s edits show up in my editor immediately — no manual refresh',
			'extension API is agent-scriptable; Copilot / Continue / similar integrate natively',
			'integrated terminal, git ui, and debug protocol means I rarely have to alt-tab',
		],
	},
	{
		id: 'terraform',
		name: 'Terraform',
		category: 'editor-infra',
		tagline: 'declarative infrastructure; agents generate HCL predictably',
		install: 'brew install terraform',
		docsUrl: 'https://www.terraform.io/',
		aiRationale: [
			'declarative: agents produce HCL that describes final state, not imperative scripts',
			'plan/apply split enforces human-in-the-loop for every mutation',
			'module system lets agents compose without reinventing',
		],
	},
];

/**
 * Look up a tool by id or by any alias. Aliases may include parenthetical
 * explanations (e.g. `'grep (aliased)'`) — we match only the leading bare
 * token, so `tools grep` and `tools rg` both resolve to ripgrep.
 */
export function findTool(query: string): Tool | undefined {
	const normalized = query.toLowerCase().trim();
	if (!normalized) return undefined;
	return tools.find((t) => {
		if (t.id === normalized) return true;
		return (t.aliases ?? []).some((alias) => {
			const bare = alias.toLowerCase().split(/[\s(]/)[0];
			return bare === normalized;
		});
	});
}
