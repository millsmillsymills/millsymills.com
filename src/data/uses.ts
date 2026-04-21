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
