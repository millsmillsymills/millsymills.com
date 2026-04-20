// Canonical app metadata. Used by Desktop, MobileFallback, and the
// per-app dynamic route for OG-tag / shareable-URL rendering.

export interface AppDef {
	id: string;
	label: string;
	glyph: string;
	title: string;
	/** Hint copy for the per-app OG description. Keep under ~150 chars. */
	ogDescription: string;
	/** Default window geometry on desktop. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** If true, skip from the mobile shell (desktop-only apps). */
	desktopOnly?: boolean;
}

export const apps: AppDef[] = [
	{
		id: 'about',
		label: 'about.me',
		glyph: '🪪',
		title: 'about.exe',
		ogDescription: 'mills — corporate security engineer @ Trail of Bits, based in Seattle. ten years of breaking and building.',
		x: 140,
		y: 60,
		width: 620,
		height: 460,
	},
	{
		id: 'resume',
		label: 'resume',
		glyph: '📄',
		title: 'resume.txt',
		ogDescription: 'mills\' resume — IAM, endpoint, automation, compliance. 10+ years across Trail of Bits, Leviathan, RealSelf, Commonwealth.',
		x: 200,
		y: 120,
		width: 680,
		height: 520,
	},
	{
		id: 'photos',
		label: 'photos',
		glyph: '🖼️',
		title: 'photos/',
		ogDescription: 'photos, mostly of cats.',
		x: 260,
		y: 140,
		width: 520,
		height: 460,
	},
	{
		id: 'terminal',
		label: 'terminal',
		glyph: '⌨️',
		title: 'mills@millsymills:~',
		ogDescription: 'a mock shell. `help`, `ls`, `nmap 192.168.1.0/24`, `flag status`. try it.',
		x: 180,
		y: 120,
		width: 680,
		height: 460,
	},
	{
		id: 'flags',
		label: 'flags.exe',
		glyph: '🚩',
		title: 'flags.exe',
		ogDescription: '10 hidden CTF flags scattered across the site. find them all. Juice-Shop-style.',
		x: 220,
		y: 140,
		width: 520,
		height: 520,
	},
	{
		id: 'projects',
		label: 'projects',
		glyph: '📦',
		title: 'projects.exe',
		ogDescription: 'MCP servers (unraid, unifi) + the source for this site. community releases, MIT.',
		x: 240,
		y: 90,
		width: 620,
		height: 520,
	},
	{
		id: 'music',
		label: 'music',
		glyph: '💿',
		title: 'winamp.exe',
		ogDescription: 'a tiny y2k winamp for whatever track mills is spinning this week.',
		x: 220,
		y: 180,
		width: 460,
		height: 460,
	},
	{
		id: 'memes',
		label: 'memes',
		glyph: '🗂️',
		title: 'memes/',
		ogDescription: 'memes. a small but earnest collection.',
		x: 240,
		y: 200,
		width: 560,
		height: 460,
	},
	{
		id: 'mail',
		label: 'mail',
		glyph: '✉️',
		title: 'mail.exe',
		ogDescription: 'ways to get in touch with mills.',
		x: 300,
		y: 160,
		width: 460,
		height: 300,
	},
	{
		id: 'trash',
		label: 'trash',
		glyph: '🗑️',
		title: 'recycle.bin',
		ogDescription: 'deleted files. mostly garbage.',
		x: 280,
		y: 220,
		width: 520,
		height: 460,
	},
];

export function findApp(id: string): AppDef | undefined {
	return apps.find((a) => a.id === id);
}
