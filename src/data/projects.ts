// Community projects — surfaced in the Projects app and the MCP
// terminal commands (`mcp list`, `mcp describe`, `mcp install`).

export interface Project {
	readonly id: string;
	readonly name: string;
	readonly tagline: string;
	readonly description: string;
	readonly repo: string;
	readonly kind: 'mcp' | 'site' | 'tool' | 'research';
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
		id: 'a2a-security-research',
		name: 'a2a-security-research',
		tagline: 'A2A protocol threat model + two reproducible PoC exploits',
		description:
			'A threat model and control catalog for the A2A (Agent-to-Agent) protocol v1.0, mapped to OWASP Agentic Security Initiative IDs, with two reproducible local proof-of-concept exploits (routing hijack; webhook SSRF). Central finding: the spec provides the machinery for secure deployments but mandates almost none of it. Analysis is pinned to a verified spec baseline — versions were introspected before any code was written.',
		repo: 'https://github.com/millsmillsymills/a2a-security-research',
		kind: 'research',
		tags: ['a2a', 'agents', 'threat-model', 'security-research', 'python'],
	},
	{
		id: 'ellingson-a2a-signed-card',
		name: 'ellingson-a2a-signed-card',
		tagline: 'spec-native signed A2A Agent Card — keyless, transparency-logged',
		description:
			'Serves an A2A v1.0 Agent Card whose trust is bound to its delivery channel. RFC 7515 JWS over the RFC 8785 canonical card, signed keylessly in CI (GitHub OIDC → Fulcio → Rekor), verified fail-closed with identity pinning, and attested at the delivery channel with DNSSEC + Certificate Transparency monitoring. No long-lived signing keys exist in the repo or CI.',
		repo: 'https://github.com/millsmillsymills/ellingson-a2a-signed-card',
		kind: 'research',
		tags: ['a2a', 'sigstore', 'supply-chain', 'dnssec', 'python'],
	},
	{
		id: 'consistency-check',
		name: 'consistency-check',
		tagline: 'canonical standards + audit tool for the MCP suite',
		description:
			'Grades every server in the MCP suite against versioned rule IDs (Python, Go, MCP-protocol, CI, security, tests) and idempotently files GitHub issues for MUST violations. The reason six servers from one maintainer stay consistent as the fleet grows.',
		repo: 'https://github.com/millsmillsymills/consistency-check',
		kind: 'tool',
		tags: ['mcp', 'audit', 'standards', 'python'],
	},
	{
		id: 'millsymills-com',
		name: 'millsymills.com',
		tagline: 'this site — Astro on fully Terraform-managed AWS',
		description:
			'The site you are using right now: Astro static output on a private S3 bucket behind CloudFront, with Route53, ACM, DNSSEC, CAA, MTA-STS, and CT monitoring, all defined in Terraform. Deploys via GitHub Actions OIDC with no long-lived credentials. MIT-licensed as a community template — fork it, rename it, ship your own.',
		repo: 'https://github.com/millsmillsymills/millsymills.com',
		kind: 'site',
		tags: ['astro', 'aws', 'terraform', 'oidc', 'iac'],
	},
	{
		id: 'unraid-mcp',
		name: 'unraid-mcp',
		tagline: 'MCP server for Unraid — talk to your array from your LLM',
		description:
			'Exposes the Unraid GraphQL API as MCP tools — array health, disks and SMART, docker lifecycle, VMs, shares, notifications, parity checks. Readonly by default; write tools are invisible until enabled. Built for homelab operators who want to debug or automate their box from a chat interface.',
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
		tagline: 'MCP server for UniFi — Network, Protect, and Site Manager',
		description:
			'Wraps all three UniFi APIs — Network, Protect, and Site Manager — as 160 MCP tools: clients, sites, events, device control, camera state, guest networks. Readonly by default with explicitly gated writes. The on-site demo drives a simulated network with an AI assistant calling the real tools.',
		repo: 'https://github.com/millsymills-com/unifi-mcp',
		icon: '/images/projects/unifi-mcp.svg',
		demoUrl: '/unifi/',
		kind: 'mcp',
		tags: ['mcp', 'unifi', 'networking', 'python'],
		install: 'claude mcp add unifi --transport http http://<controller-host>:8766/',
		describe:
			'UniFi MCP server. 160 tools across Network, Protect, Site Manager. Writes gated; live demo on this site.',
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
