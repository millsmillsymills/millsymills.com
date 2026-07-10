// /uses — gear + setup, in the wesbos.com/uses tradition.
//
// Keep this honest: only list stuff that's actually on your desk or
// running in your rack. Update when it changes.

export interface GearItem {
	readonly name: string;
	readonly detail?: string;
	readonly url?: string;
	readonly why?: string;
	/** Optional pixel-art icon path under `public/`. Rendered at 32px with `image-rendering: pixelated` (#165). */
	readonly icon?: `/${string}`;
	/** Render the icon at a larger size when the default 32px is too small to read. */
	readonly largeIcon?: boolean;
	/** On-site demo route (e.g. `/unifi/`) surfaced as a "live demo" link on the item. */
	readonly demoUrl?: `/${string}`;
}

export interface GearGroup {
	readonly title: string;
	readonly items: readonly GearItem[];
}

export const chimera = {
	name: 'chimera',
	role: 'primary server, unholy spinning disk array',
	// keep the shape predictable — the terminal `chimera` command
	// renders this as a neofetch-style block.
	specs: [
		{ k: 'model', v: 'custom build' },
		{ k: 'motherboard', v: 'MSI MAG Z790 Tomahawk Max WIFI (MS-7E25) rev 2.0' },
		{ k: 'BIOS', v: 'AMI A.80 · 2024-09-27' },
		{ k: 'CPU', v: '12th Gen Intel Core i5-12600K @ 3663 MHz' },
		{ k: 'virt', v: 'HVM + IOMMU enabled' },
		{ k: 'memory', v: '128 GiB DDR5 (max installable)' },
		{ k: 'cache', v: 'L1/L2/L3 — 288+192 KiB / 7680 KiB / 20 MiB (+ E-core tier)' },
		{ k: 'storage', v: '100 TB parity-protected array · 2 TB SSD cache' },
		{ k: 'network', v: 'bond0 active-backup · UniFi upstream · mtu 1500' },
		{ k: 'kernel', v: 'Linux 6.12.54-Unraid x86_64' },
		{ k: 'openssl', v: '3.5.4' },
	],
} as const;

export const gear: readonly GearGroup[] = [
	{
		title: 'this site',
		items: [
			{
				name: 'Astro 6',
				detail: 'static output, islands when needed',
				url: 'https://astro.build',
				why: 'best DX for static-first sites with sprinkles of vanilla-TS islands.',
			},
			{
				name: 'TypeScript + vanilla TS modules',
				detail: 'no React/Vue runtime',
				why: 'window manager, terminal, mobile shell are all hand-rolled — wanted control + zero framework bloat.',
			},
			{
				name: 'AWS S3 + CloudFront (OAC)',
				detail: 'private bucket, REST endpoint, OAC signing',
				why: 'simple, durable, cheap, plays nicely with Terraform + OIDC.',
			},
			{
				name: 'CloudFront Function (cf-js-2.0)',
				detail: 'directory URI rewriter',
				why: 'OAC + REST endpoint does not auto-resolve /path/ → /path/index.html, so a tiny viewer-request function does it.',
			},
			{
				name: 'Route53 + ACM',
				detail: 'IPv4 + IPv6 alias records, us-east-1 cert for CloudFront',
				why: 'DNS + certs in the same provider as everything else.',
			},
			{
				name: 'GitHub Actions OIDC',
				detail: 'no long-lived AWS credentials in the repo',
				why: 'short-lived role assumption — IAM trust policy pins the sub claim to the production environment AND the workflow_ref to main. tampered workflow file from another branch can\'t mint the deploy token.',
			},
			{
				name: 'ProtonMail custom domain',
				detail: 'SPF + 3-selector DKIM + DMARC p=reject (strict alignment) + MTA-STS enforce + TLS-RPT',
				why: 'mail provider that earns the privacy-engineer cred. paranoid DMARC from day one.',
			},
			{
				name: 'MIT license',
				detail: 'fork it, ship your own',
				url: 'https://github.com/millsmillsymills/millsymills.com/blob/main/LICENSE',
				why: 'the whole point of releasing it.',
			},
		],
	},
	{
		title: 'keyboard',
		items: [
			{
				name: 'Glorious mechanical keyboard',
				detail: 'hot-swap, tactile switches',
				url: 'https://www.gloriousgaming.com/',
				why: 'hot-swap means i can rebuild the feel without tearing down the whole board.',
			},
			{
				name: 'shirtz.cool — Dark Mage keycaps',
				detail: 'pbt dye-sub, gothic/wizard aesthetic',
				url: 'https://shirtz.cool/products/the-dark-mage-keycaps',
				why: 'arcane energy > chiclet laptop keys.',
			},
		],
	},
	{
		title: 'homelab',
		items: [
			{
				name: 'UniFi networking stack',
				detail: 'controller + switches + APs',
				url: 'https://ui.com/',
				why: 'one pane of glass for the whole /24. great telemetry. hence unifi-mcp — drive a simulated version of it from the live demo.',
				icon: '/images/icons/uses/unifi-pixel.png',
				demoUrl: '/unifi/',
			},
		],
	},
	{
		title: 'coffee',
		items: [
			{
				name: 'Technivorm Moccamaster KBG',
				detail: 'hand-assembled in the Netherlands, 30-year lifespan',
				url: 'https://us.moccamaster.com/collections/coffee-brewers/products/kbg',
				why: 'the pour-over of auto-drips. pulls the right temperature and stays out of the way.',
				icon: '/images/icons/uses/moccamaster-pixel.png',
				largeIcon: true,
			},
			{
				name: 'Philips 800 Series',
				detail: 'fully automatic espresso + milk frother',
				url: 'https://www.usa.philips.com/c-p/EP3241_54/3200-series-fully-automatic-espresso-machines',
				why: 'because some mornings the Moccamaster is not enough.',
			},
		],
	},
	{
		title: 'mac security',
		items: [
			{
				name: 'Objective-See LuLu',
				detail: 'host-based firewall, alerts on new outbound connections',
				url: 'https://objective-see.org/products/lulu.html',
				why: 'macOS has no built-in outbound-traffic prompt — LuLu fills that gap. catches a backgrounded process phoning home before it does.',
			},
			{
				name: 'Objective-See DoNotDisturb',
				detail: 'detects lid-open intrusion events',
				url: 'https://objective-see.org/products/dnd.html',
				why: 'the evil-maid attack at its laziest: open the laptop, plug in a USB, walk away. DND records the event with timestamp + (optionally) a webcam frame so an unattended open is observable after the fact.',
			},
			{
				name: 'Objective-See KnockKnock',
				detail: 'on-demand persistence scanner (no daemon)',
				url: 'https://objective-see.org/products/knockknock.html',
				why: "what BlockBlock catches in real time, KnockKnock surfaces in retrospect — useful after the fact when you're auditing a machine you can't fully trust.",
			},
			{
				name: 'Objective-See TaskExplorer',
				detail: 'process inspector — code-signing, loaded dylibs, network',
				url: 'https://objective-see.org/products/taskexplorer.html',
				why: "Activity Monitor doesn't show code-signing trust, loaded dylibs, or per-process network usage. TaskExplorer surfaces all three in one pane — closest thing to Procmon on macOS.",
			},
			{
				name: 'Objective-See Netiquette',
				detail: 'network monitor — live snapshot of process ↔ connection',
				url: 'https://objective-see.org/products/netiquette.html',
				why: 'complements LuLu: LuLu prompts on new outbound; Netiquette shows the live picture of what is currently connected, with the offending process named.',
			},
			{
				name: 'Objective-See BlockBlock',
				detail: 'monitors persistence locations, alerts on installs',
				url: 'https://objective-see.org/products/blockblock.html',
				why: 'malware persists via LaunchAgents, LoginItems, kexts, and a long tail of obscure plist paths. BlockBlock prompts on every write so a silent install is noisy.',
			},
			{
				name: 'Objective-See OverSight',
				detail: 'alerts when the mic or webcam is activated',
				url: 'https://objective-see.org/products/oversight.html',
				why: 'closes the gap between the camera LED and the OS-level permission grant — explicit notification per access, with the offending process named.',
			},
		],
	},
];
