import type { Tint } from './palette';

export type Shot =
	| { readonly kind: 'title'; readonly text: string; readonly beats: number; readonly accent?: Tint }
	| {
			readonly kind: 'still';
			readonly src: string;
			readonly beats: number;
			readonly tint?: Tint;
			readonly zoom?: boolean;
	  }
	| { readonly kind: 'placeholder'; readonly beats: number; readonly tint: Exclude<Tint, 'none'> };

// The cut, in beats. Eva OP grammar: flashed title cards on black, hard cuts,
// tinted freeze-frames, final lockup. `placeholder` entries become `still`
// entries when the AI-stylized images land.
// All copy lowercase — "mills" branding rule.
export const SHOTS: readonly Shot[] = [
	{ kind: 'title', text: 'millsymills.com', beats: 2 },
	{ kind: 'placeholder', tint: 'pink', beats: 2 },
	{ kind: 'title', text: 'presents', beats: 1, accent: 'cyan' },
	{ kind: 'placeholder', tint: 'cyan', beats: 1 },
	{ kind: 'title', text: 'a mills\nproduction', beats: 2 },
	{ kind: 'placeholder', tint: 'pink', beats: 0.5 },
	{ kind: 'placeholder', tint: 'cyan', beats: 0.5 },
	{ kind: 'placeholder', tint: 'pink', beats: 0.5 },
	{ kind: 'title', text: 'security engineer', beats: 1.5, accent: 'pink' },
	{ kind: 'placeholder', tint: 'cyan', beats: 2 },
	{ kind: 'title', text: 'seattle, wa', beats: 1 },
	{ kind: 'placeholder', tint: 'pink', beats: 3 },
	{ kind: 'title', text: 'breaking things\nsince 2016', beats: 2 },
	{ kind: 'placeholder', tint: 'cyan', beats: 0.5 },
	{ kind: 'placeholder', tint: 'pink', beats: 0.5 },
	{ kind: 'placeholder', tint: 'cyan', beats: 0.5 },
	{ kind: 'placeholder', tint: 'pink', beats: 0.5 },
	{ kind: 'title', text: 'welcome', beats: 2, accent: 'cyan' },
	{ kind: 'placeholder', tint: 'pink', beats: 4 },
	{ kind: 'title', text: 'millsymills.com', beats: 4, accent: 'pink' },
];

export function totalBeats(): number {
	let sum = 0;
	for (const shot of SHOTS) sum += shot.beats;
	return sum;
}
