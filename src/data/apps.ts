// Canonical app metadata. Used by Desktop, MobileFallback, and the
// per-app dynamic route for OG-tag / shareable-URL rendering.

/**
 * Sheet name (under `public/images/winicons/<sheet>.png`) plus the
 * 0-indexed grid cell to render. The sprite sheets are the XP WinIcons
 * pack at three native cell sizes; pick whichever matches the target
 * render size best. The cell math lives in `iconSpriteStyle` below so
 * adding a second sprite-sourced icon is a one-liner in this file.
 *
 * Sheet grids (col x row):
 *   WinIcons_16: 23 x 23 (cell = 16px)
 *   WinIcons_32: 23 x 22 (cell = 32px)
 *   WinIcons_48: 20 x 20 (cell = 48px)
 */
export interface IconSpriteRef {
	readonly sheet: 'WinIcons_16' | 'WinIcons_32' | 'WinIcons_48';
	readonly col: number;
	readonly row: number;
}

interface SpriteGrid {
	readonly cols: number;
	readonly rows: number;
}

const SPRITE_GRID: Record<IconSpriteRef['sheet'], SpriteGrid> = {
	WinIcons_16: { cols: 23, rows: 23 },
	WinIcons_32: { cols: 23, rows: 22 },
	WinIcons_48: { cols: 20, rows: 20 },
};

/**
 * Build the inline style for a sprite-sourced icon at `renderSize` px.
 * The background-size is the full sheet scaled so each cell renders at
 * `renderSize`, so the same sprite ref renders correctly at any target
 * size (72px desktop, 56px mobile, etc.).
 */
export function iconSpriteStyle(ref: IconSpriteRef, renderSize: number): string {
	const grid = SPRITE_GRID[ref.sheet];
	const url = `/images/winicons/${ref.sheet}.png`;
	const sheetW = grid.cols * renderSize;
	const sheetH = grid.rows * renderSize;
	const posX = -ref.col * renderSize;
	const posY = -ref.row * renderSize;
	return `background-image:url('${url}');background-position:${posX}px ${posY}px;background-size:${sheetW}px ${sheetH}px`;
}

export interface AppDef {
	readonly id: string;
	readonly label: string;
	readonly glyph: string;
	/** Path under public/ to a PNG or SVG icon. When set, replaces glyph in the UI. */
	readonly iconUrl?: string;
	/**
	 * Sprite-sourced icon from the XP WinIcons pack. Wins over `iconUrl`
	 * and `glyph` when present. See `IconSpriteRef` for sheet/cell math.
	 */
	readonly iconSprite?: IconSpriteRef;
	readonly title: string;
	/** Hint copy for the per-app OG description. Keep under ~150 chars. */
	readonly ogDescription: string;
	/** Default window geometry on desktop. */
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** If true, skip from the mobile shell (desktop-only apps). */
	readonly desktopOnly?: boolean;
	/**
	 * If true, hide from every public-facing index — desktop launcher,
	 * mobile launcher, start menu, command palette, llms.txt, sitemap.
	 * The per-app route (`/<id>/`) keeps working for direct hits; this
	 * flag controls *advertising*, not reachability. Use for unfinished
	 * apps (mail before Proton activates, vscode before dotfiles are
	 * reviewed). The CI llms.txt completeness check
	 * (`scripts/assert-llms-txt-completeness.sh`) skips hidden ids.
	 */
	readonly hidden?: boolean;
}

// Two-layer pattern: the const tuple `_APPS_DATA` keeps the literal types
// (used to derive AppId below); the public `apps` export widens to
// `readonly AppDef[]` so consumers can access optional fields like
// `iconUrl` on every entry without TS narrowing them away on entries that
// happen to omit the field.
const _APPS_DATA = [
	{
		id: 'about',
		label: 'about.me',
		glyph: '🪪',
		iconUrl: '/images/icons/about.svg',
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
		iconUrl: '/images/icons/vaporwave/floppy-disk.png',
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
		iconUrl: '/images/icons/web10/broken-image-netscape.png',
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
		iconUrl: '/images/icons/web10/windows-95-internet.png',
		title: 'mills@millsymills:~',
		ogDescription: 'a mock shell. `help`, `ls`, `nmap 192.168.1.0/24`. try it.',
		desktopOnly: true,
		x: 180,
		y: 120,
		width: 680,
		height: 460,
	},
	{
		id: 'projects',
		label: 'projects',
		glyph: '📦',
		iconUrl: '/images/icons/web10/under-construction-1.png',
		title: 'projects.exe',
		ogDescription: 'MCP servers (unraid, unifi) + the source for this site. community releases, MIT.',
		x: 240,
		y: 90,
		width: 620,
		height: 520,
	},
	{
		id: 'unifi',
		label: 'unifi-mcp',
		glyph: '📡',
		iconUrl: '/images/projects/unifi-mcp-transparent.svg',
		title: 'unifi-mcp.exe',
		ogDescription:
			'a live, simulated unifi-mcp demo — drive a fake network with an AI assistant calling real MCP tools across network, protect, and site manager.',
		// Embeds the self-contained demo from public/apps/unifi-demo/ in an
		// iframe (UniFi.astro).
		x: 130,
		y: 70,
		width: 980,
		height: 680,
	},
	{
		id: 'uses',
		label: 'uses',
		glyph: '🧰',
		iconUrl: '/images/icons/web10/dial-up-days.png',
		title: '/uses',
		ogDescription: 'gear on the desk + chimera in the rack. keyboard, keycaps, unraid, unifi, coffee.',
		x: 160,
		y: 80,
		width: 640,
		height: 520,
	},
	{
		id: 'music',
		label: 'vaporplayer',
		glyph: '💿',
		iconUrl: '/images/icons/web10/midi-music.png',
		title: 'vaporplayer',
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
		iconUrl: '/images/icons/vaporwave/japanese-wave.png',
		title: 'memes/',
		ogDescription: 'memes. a small but earnest collection.',
		x: 240,
		y: 200,
		width: 560,
		height: 460,
	},
	{
		id: 'incidents',
		label: 'incidents',
		glyph: '🚨',
		iconUrl: '/images/icons/incidents.svg',
		title: 'incidents.log',
		ogDescription: 'notable security incidents and CVEs mills has personally responded to. structured war stories, not resume bullets.',
		x: 260,
		y: 120,
		width: 640,
		height: 560,
	},
	{
		id: 'mail',
		label: 'mail',
		glyph: '✉️',
		iconUrl: '/images/icons/web10/netscape-floppy.png',
		title: 'mail.exe',
		ogDescription: 'ways to get in touch with mills.',
		x: 300,
		y: 160,
		width: 460,
		height: 300,
	},
	{
		id: 'privacy',
		label: 'privacy',
		glyph: '🔒',
		iconUrl: '/images/icons/vaporwave/keyed-file.png',
		title: 'privacy.txt',
		ogDescription: 'the site\'s data posture — no tracking, no cookies, no third-party scripts. a privacy page you can verify.',
		x: 200,
		y: 140,
		width: 620,
		height: 520,
	},
	{
		id: 'security',
		label: 'security',
		glyph: '🛡️',
		iconUrl: '/images/icons/security.svg',
		title: 'security.txt',
		ogDescription: 'controls shipped on this site — DNSSEC, CAA, CT monitoring, SBOM, mail-auth stack. every claim links to the implementation.',
		x: 220,
		y: 100,
		width: 720,
		height: 580,
	},
	{
		id: 'inspector',
		label: 'inspector',
		glyph: '🔍',
		iconUrl: '/images/icons/inspector.svg',
		title: 'inspector.exe',
		ogDescription: 'live security-headers inspector. fetches the site\'s own response headers and grades them against the controls listed in security.txt.',
		x: 240,
		y: 140,
		width: 720,
		height: 560,
	},
	{
		id: 'trash',
		label: 'trash',
		glyph: '🗑️',
		iconUrl: '/images/icons/vaporwave/dixie-cup.png',
		title: 'recycle.bin',
		ogDescription: 'deleted files. mostly garbage.',
		x: 280,
		y: 220,
		width: 520,
		height: 460,
	},
	{
		id: 'vscode',
		label: 'vscode',
		glyph: '🆅',
		iconUrl: '/images/icons/vscode.svg',
		title: 'vscode.exe',
		ogDescription: 'an evocative, pink-tinted vscode reskin. browse real dotfiles and snippets of the site\'s own source.',
		x: 140,
		y: 80,
		width: 900,
		height: 620,
	},
	{
		id: 'minesweeper',
		label: 'minesweeper',
		glyph: '💣',
		title: 'minesweeper.exe',
		ogDescription: 'easter-egg homage to the winxp minesweeper screenshot. no game logic — just the picture.',
		// Easter egg — intentionally not surfaced from the launcher;
		// reward for poking at /minesweeper/ directly.
		hidden: true,
		x: 260,
		y: 160,
		width: 360,
		height: 460,
	},
	{
		id: 'display',
		label: 'display',
		glyph: '🖼️',
		iconUrl: '/images/icons/display.svg',
		title: 'display.cpl',
		ogDescription: 'a tiny windows-style display panel. pick a desktop theme and wallpaper; choices persist in localStorage.',
		// Wallpaper only renders on the desktop layout (mshell never
		// surfaces .desktop's bg-image), so this app is meaningless on
		// mobile.
		desktopOnly: true,
		x: 240,
		y: 100,
		width: 640,
		height: 520,
	},
	{
		id: 'status',
		label: 'status',
		glyph: '📊',
		title: 'chimera.status',
		ogDescription: 'live snapshot of the chimera homelab box — uptime, container counts, array fill, parity, SMART. refreshed daily.',
		x: 280,
		y: 140,
		width: 520,
		height: 440,
	},
] as const satisfies readonly AppDef[];

export const apps: readonly AppDef[] = _APPS_DATA;

/**
 * Literal-union type derived from the `apps` array. A typo like
 * `[data-open-window="trsh"]` becomes a TypeScript error at the call site
 * instead of a silent no-op at runtime.
 */
export type AppId = (typeof _APPS_DATA)[number]['id'];

/** Runtime guard for narrowing route-param / DOM-attribute strings to AppId. */
export function isAppId(value: string | undefined | null): value is AppId {
	return typeof value === 'string' && apps.some((a) => a.id === value);
}

export function findApp(id: string): AppDef | undefined {
	return apps.find((a) => a.id === id);
}
