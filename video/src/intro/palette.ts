// Storyboard palette (design-project assets/manifest.json), not the site
// tokens — the intro deliberately grades hotter than the desktop chrome.
export const PALETTE = {
	void: '#030308',
	cyan: '#00f0ff',
	magenta: '#ff2bd6',
	phosphor: '#39ff14',
	amber: '#ffb000',
	purple: '#b066ff',
	red: '#ff3344',
	fg: '#e8f6ff',
} as const;

export type Accent = 'cyan' | 'magenta' | 'phosphor' | 'amber' | 'purple' | 'red';
