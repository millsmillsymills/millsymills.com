// Community projects — surfaced in the Projects app and the MCP
// terminal commands (`mcp list`, `mcp describe`, `mcp install`).

export interface Project {
	id: string;
	name: string;
	tagline: string;
	description: string;
	repo: string;
	kind: 'mcp' | 'site' | 'tool';
	tags: string[];
	/** command line to install (e.g. `claude mcp add ...`). Optional. */
	install?: string;
	/** short blurb shown by `mcp describe`. */
	describe?: string;
}

export const projects: Project[] = [
	{
		id: 'unraid-mcp',
		name: 'unraid-mcp',
		tagline: 'MCP server for Unraid — talk to your array from your LLM',
		description:
			'Exposes an Unraid server (array status, docker containers, VMs, shares, parity, SMART) as tools to any MCP client. Built for homelab operators who want to debug or automate their box from a chat interface. Runs as a container on the Unraid host.',
		repo: 'https://github.com/millsmillsymills/unraid-mcp',
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
		repo: 'https://github.com/millsmillsymills/unifi-mcp',
		kind: 'mcp',
		tags: ['mcp', 'unifi', 'networking', 'python'],
		install: 'claude mcp add unifi --transport http http://<controller-host>:8766/',
		describe:
			'UniFi MCP server. Tools for clients, sites, events, device control, guest-network toggles.',
	},
	{
		id: 'millsymills.com',
		name: 'millsymills.com',
		tagline: 'this site — portfolio + community template',
		description:
			'The source for the site you are looking at. Astro + Terraform + GitHub Actions OIDC. Released under MIT as a community template — fork it for your own Y2K-pink desktop portfolio.',
		repo: 'https://github.com/millsmillsymills/millsymills.com',
		kind: 'site',
		tags: ['astro', 'terraform', 'aws', 'mit'],
	},
];

export function findProject(id: string): Project | undefined {
	return projects.find((p) => p.id === id);
}

export const mcpProjects = (): Project[] => projects.filter((p) => p.kind === 'mcp');
