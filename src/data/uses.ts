// /uses — gear + setup, in the wesbos.com/uses tradition.
//
// Keep this honest: only list stuff that's actually on your desk or
// running in your rack. Update when it changes.

export interface GearItem {
	readonly name: string;
	readonly detail?: string;
	readonly url?: string;
	readonly why?: string;
}

export interface GearGroup {
	readonly title: string;
	readonly items: readonly GearItem[];
}

export const chimera = {
	name: 'chimera',
	role: 'primary unraid server. the ripper.',
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
				why: 'window manager, terminal, flags, mobile shell are all hand-rolled — wanted control + zero framework bloat.',
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
				name: 'Terraform 1.10+',
				detail: 'state in S3 with use_lockfile (no DynamoDB)',
				url: 'https://www.terraform.io/',
				why: 'single tool for all infra. S3-native locking removed the last vestigial DDB table.',
			},
			{
				name: 'GitHub Actions OIDC',
				detail: 'no long-lived AWS credentials in the repo',
				why: 'short-lived role assumption, scoped to refs/heads/main.',
			},
			{
				name: 'ProtonMail custom domain',
				detail: 'SPF + 3-selector DKIM + DMARC p=reject (strict alignment)',
				why: 'mail provider that earns the privacy-engineer cred. paranoid DMARC from day one.',
			},
			{
				name: 'CTF flag system',
				detail: 'SHA-256 client-side verification, localStorage',
				why: 'Juice-Shop-style. canonical strings stay out of the bundle for most challenges.',
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
		title: 'battlestation',
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
				name: 'chimera (unraid server)',
				detail: 'custom z790 · i5-12600k · 128GB DDR5 · 100TB + 2TB SSD cache',
				why: 'lives in the basement, runs the containers, hosts the MCPs, holds the media.',
			},
			{
				name: 'UniFi networking stack',
				detail: 'controller + switches + APs',
				url: 'https://ui.com/',
				why: 'one pane of glass for the whole /24. great telemetry. hence unifi-mcp.',
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
			},
			{
				name: 'Philips 800 Series',
				detail: 'fully automatic espresso + milk frother',
				url: 'https://www.usa.philips.com/c-p/EP3241_54/3200-series-fully-automatic-espresso-machines',
				why: 'because some mornings the Moccamaster is not enough.',
			},
		],
	},
];
