// Community projects — surfaced in the Projects app and the MCP
// terminal commands (`mcp list`, `mcp describe`, `mcp install`).

export interface Project {
	readonly id: string;
	readonly name: string;
	readonly tagline: string;
	readonly description: string;
	readonly repo: string;
	readonly kind: 'mcp' | 'site' | 'tool';
	readonly tags: readonly string[];
	/** command line to install (e.g. `claude mcp add ...`). Optional. */
	readonly install?: string;
	/** short blurb shown by `mcp describe`. */
	readonly describe?: string;
	/** Path to a logo asset under `public/`, e.g. `/images/projects/foo.svg`. */
	readonly icon?: `/${string}`;
	/** On-site demo route (e.g. `/unifi/`) when the project has a live, playable demo app. */
	readonly demoUrl?: `/${string}`;
}

export const projects: readonly Project[] = [
	{
		id: 'unraid-mcp',
		name: 'unraid-mcp',
		tagline: 'MCP server for Unraid — talk to your array from your LLM',
		description:
			'Exposes an Unraid server (array status, docker containers, VMs, shares, parity, SMART) as tools to any MCP client. Built for homelab operators who want to debug or automate their box from a chat interface. Runs as a container on the Unraid host.',
		repo: 'https://github.com/millsymills-com/unraid-mcp',
		icon: '/images/projects/unraid-mcp.svg',
		kind: 'mcp',
		tags: ['mcp', 'unraid', 'homelab', 'python'],
		install: 'claude mcp add unraid --transport http http://<unraid-host>:8765/',
		describe:
			'Unraid MCP server. Tools for array health, docker lifecycle, share/VM inventory, SMART, parity checks.',
	},
	{
		id: 'unifi-mcp',
		name: 'unifi-mcp',
		tagline: 'MCP server for UniFi — network state and control',
		description:
			'Wraps the UniFi Controller API as MCP tools: list clients, inspect sites, kick a misbehaving device, pull event logs, toggle guest networks. Useful for anyone running UniFi at home or at a small org who wants an LLM-native way to poke at the network.',
		repo: 'https://github.com/millsymills-com/unifi-mcp',
		icon: '/images/projects/unifi-mcp.svg',
		demoUrl: '/unifi/',
		kind: 'mcp',
		tags: ['mcp', 'unifi', 'networking', 'python'],
		install: 'claude mcp add unifi --transport http http://<controller-host>:8766/',
		describe:
			'UniFi MCP server. Tools for clients, sites, events, device control, guest-network toggles.',
	},
	{
		id: 'protonmail-mcp',
		name: 'protonmail-mcp',
		tagline: 'MCP server for Proton Mail — addresses, domains, keys',
		description:
			'Lets an MCP client manage a Proton Mail account: list/create/delete addresses, add and verify custom domains, edit mail and account settings, inspect encryption keys. Reads are always on; writes opt in via env flag. Built in Go on top of go-proton-api.',
		repo: 'https://github.com/millsymills-com/protonmail-mcp',
		icon: '/images/projects/protonmail-mcp.svg',
		kind: 'mcp',
		tags: ['mcp', 'protonmail', 'email', 'go'],
		install: 'claude mcp add protonmail -- protonmail-mcp',
		describe:
			'Proton Mail MCP server. Tools for addresses, custom domains, mail/account settings, encryption keys.',
	},
	{
		id: 'gandi-mcp',
		name: 'gandi-mcp',
		tagline: 'MCP server for Gandi — domains, DNS, email, certificates',
		description:
			'Wraps the Gandi v5 API as 187 MCP tools across domains, LiveDNS, email, billing, organizations, and certificates. Three-tier safety model: readonly by default, opt in to writes, and a separate flag to expose tools that spend money. Defense-in-depth checks at both tool-visibility and runtime.',
		repo: 'https://github.com/millsymills-com/gandi-mcp',
		icon: '/images/projects/gandi-mcp.svg',
		kind: 'mcp',
		tags: ['mcp', 'gandi', 'dns', 'domains', 'python'],
		install: 'claude mcp add gandi -- gandi-mcp',
		describe:
			'Gandi MCP server. 187 tools for domains, DNS, email, billing, certs. Writes and purchases are gated.',
	},
	{
		id: 'shortcut-mcp',
		name: 'shortcut-mcp',
		tagline: 'MCP server for Shortcut — full read/write/destructive surface',
		description:
			'Wraps the Shortcut REST API as 137 MCP tools across 26 resource modules (65 read, 51 write, 21 destructive). Three-tier safety model: read-only by default, writes opt in via SHORTCUT_MODE=readwrite, and deletes/workspace-wide toggles require a separate SHORTCUT_ALLOW_DESTRUCTIVE flag. Built in Python on FastMCP.',
		repo: 'https://github.com/millsymills-com/shortcut-mcp',
		icon: '/images/projects/shortcut-mcp.svg',
		kind: 'mcp',
		tags: ['mcp', 'shortcut', 'project-management', 'python'],
		install: 'uv tool install git+https://github.com/millsymills-com/shortcut-mcp',
		describe:
			'Shortcut MCP server. 137 tools across 26 modules for stories, epics, iterations, workflows. Writes and deletes are gated.',
	},
	{
		id: 'flipperzero-mcp',
		name: 'flipperzero-mcp',
		tagline: 'MCP server for Flipper Zero — USB + WiFi protobuf RPC',
		description:
			'Speaks protobuf RPC to a Flipper Zero over USB serial or over WiFi (via an ESP32 dev board running a TCP↔UART bridge), exposing connection and system tools to MCP clients. The `auto` transport tries USB first and falls back to WiFi when a host is set. Built in Python on FastMCP.',
		repo: 'https://github.com/millsymills-com/flipperzero-mcp',
		icon: '/images/projects/flipperzero-mcp.svg',
		kind: 'mcp',
		tags: ['mcp', 'flipper-zero', 'hardware', 'python'],
		install: 'uv tool install git+https://github.com/millsymills-com/flipperzero-mcp',
		describe:
			'Flipper Zero MCP server. Protobuf RPC over USB or WiFi; tools for connection health, reconnect, system info.',
	},
	{
		id: 'millsymills-com-org',
		name: 'millsymills-com-org',
		tagline: 'GitHub org-as-code — OpenTofu, OIDC, ruleset-as-code',
		description:
			'Manages the millsymills-com GitHub org as code with OpenTofu: org and per-repo baselines plus default-branch and tag-protection rulesets, all as reusable modules with native tofu test coverage. PR-driven and OIDC-enforced — plan on PR, scheduled drift detection, apply gated behind a verified-commits check, no long-lived credentials. Ships its own CI security stack: CodeQL, gitleaks, OSSF Scorecard, zizmor, and actionlint.',
		repo: 'https://github.com/millsymills-com/millsymills-com-org',
		kind: 'tool',
		tags: ['terraform', 'opentofu', 'github', 'oidc', 'iac'],
	},
	{
		id: 'claude-defaults',
		name: 'claude-defaults',
		tagline: 'agent config + skills — installable Claude Code guardrails',
		description:
			'A shareable Claude Code baseline: sandboxing, permission policy, MCP defaults, and PreToolUse guardrail hooks that block destructive commands and pushes to main and warn on sensitive-path writes — plus the authored skills that ship with it. Distributed via an idempotent, reversible installer.',
		repo: 'https://github.com/millsmillsymills/claude-defaults',
		kind: 'tool',
		tags: ['claude-code', 'agents', 'hooks', 'skills', 'dotfiles'],
	},
];

export function findProject(id: string): Project | undefined {
	return projects.find((p) => p.id === id);
}

export const mcpProjects = (): readonly Project[] => projects.filter((p) => p.kind === 'mcp');
