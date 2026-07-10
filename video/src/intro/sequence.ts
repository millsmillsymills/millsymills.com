import type { Accent } from './palette';

// `cutout` stills are alpha PNGs floated on the void + grid; the rest are
// full-frame treatments.
export const STILLS = {
	cut1266Magenta: { src: 'cutouts/IMG_1266-duotone-magenta.png', cutout: true },
	cut1263Red: { src: 'cutouts/IMG_1263-duotone-red.png', cutout: true },
	cut1264Amber: { src: 'cutouts/IMG_1264-duotone-amber.png', cutout: true },
	cut1267Purple: { src: 'cutouts/IMG_1267-duotone-purple.png', cutout: true },
	cut1262Phosphor: { src: 'cutouts/IMG_1262-duotone-phosphor.png', cutout: true },
	cut1261Cyan: { src: 'cutouts/IMG_1261-duotone-cyan.png', cutout: true },
	posterize: { src: 'stills/still-posterize-cyan.png', cutout: false },
} as const;

export type StillId = keyof typeof STILLS;

export type Beat =
	| { readonly from: number; readonly dur: number; readonly kind: 'boot'; readonly text: string }
	| {
			readonly from: number;
			readonly dur: number;
			readonly kind: 'card';
			readonly eyebrow: string;
			readonly text: string;
			readonly accent: Accent;
	  }
	| {
			readonly from: number;
			readonly dur: number;
			readonly kind: 'still';
			readonly still: StillId;
			readonly zoom?: number;
			readonly flash?: boolean;
	  }
	| {
			readonly from: number;
			readonly dur: number;
			readonly kind: 'strobe';
			readonly stills: readonly StillId[];
			readonly framesPer: number;
	  }
	| { readonly from: number; readonly dur: number; readonly kind: 'lockup' };

// The cut, in frames @ 30fps — mirrors the design project's
// assets/manifest.json `sequence` (Intro Storyboard.dc.html, 17 beats, 900f).
export const BEATS: readonly Beat[] = [
	{ from: 0, dur: 75, kind: 'boot', text: '> millsymills.com' },
	{ from: 75, dur: 15, kind: 'still', still: 'cut1266Magenta', flash: true },
	{ from: 90, dur: 60, kind: 'card', eyebrow: 'TRANSMISSION 01', text: 'A FLEET OF PROGRAMS ON THE GRID', accent: 'cyan' },
	{ from: 150, dur: 15, kind: 'still', still: 'cut1263Red' },
	{ from: 165, dur: 60, kind: 'card', eyebrow: 'TRANSMISSION 02', text: 'MCP SERVERS — COMMUNITY BUILT', accent: 'magenta' },
	{ from: 225, dur: 15, kind: 'still', still: 'posterize' },
	{ from: 240, dur: 60, kind: 'card', eyebrow: 'UNIT-01 · UNIFI', text: 'READ SITES · LIST CLIENTS · RESTART APS', accent: 'cyan' },
	{ from: 300, dur: 15, kind: 'still', still: 'cut1264Amber', zoom: 1.4 },
	{ from: 315, dur: 60, kind: 'card', eyebrow: 'UNIT-02 · PROTONMAIL', text: 'READS INBOX · DRAFTS REPLY · SENDS', accent: 'magenta' },
	{ from: 375, dur: 15, kind: 'still', still: 'cut1267Purple', zoom: 1.4 },
	{ from: 390, dur: 60, kind: 'card', eyebrow: 'UNIT-03 · UNRAID', text: 'ARRAY ONLINE · PARITY VALID', accent: 'phosphor' },
	{ from: 450, dur: 15, kind: 'still', still: 'cut1262Phosphor' },
	{ from: 465, dur: 60, kind: 'card', eyebrow: 'UNIT-04 · GANDI', text: 'DOMAINS RESOLVE · RENEWALS WATCHED', accent: 'amber' },
	{ from: 525, dur: 15, kind: 'strobe', stills: ['cut1266Magenta', 'cut1263Red', 'cut1261Cyan', 'cut1262Phosphor'], framesPer: 3 },
	{ from: 540, dur: 90, kind: 'card', eyebrow: 'NOTICE', text: 'NO WARRANTY. READ THE LICENSE.', accent: 'red' },
	{ from: 630, dur: 60, kind: 'card', eyebrow: 'ALL UNITS', text: 'STATUS: ONLINE', accent: 'phosphor' },
	{ from: 690, dur: 210, kind: 'lockup' },
];

export function totalFrames(): number {
	let end = 0;
	for (const beat of BEATS) end = Math.max(end, beat.from + beat.dur);
	return end;
}
