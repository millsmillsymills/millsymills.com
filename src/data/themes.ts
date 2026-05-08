export interface Theme {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly swatches: readonly [string, string, string];
}

export const THEME_STORAGE_KEY = 'mills.theme.v1';

export const themes: readonly Theme[] = [
	{
		id: 'vaporwave',
		label: 'vaporwave',
		description: 'neon-noir default: hot pink, cyan, deep navy.',
		swatches: ['#0a0320', '#ff4fa8', '#00e5ff'],
	},
	{
		id: 'bimbows',
		label: 'michaelsoft bimbows',
		description: 'cursed win95 gray panels, navy title bars, square edges.',
		swatches: ['#c0c0c0', '#000080', '#ff0000'],
	},
	{
		id: 'barbie',
		label: 'barbie',
		description: 'girlypop pink overload, bubbly chrome, orchid accents.',
		swatches: ['#ff69b4', '#ff007f', '#fff0f5'],
	},
	{
		id: 'hacker',
		label: 'hacker',
		description: 'black terminal glass, matrix green, red warning accents.',
		swatches: ['#000000', '#00ff41', '#ff0000'],
	},
	{
		id: 'arizona',
		label: 'arizona iced tea',
		description: 'teal can vibes with sunset pink and label gold.',
		swatches: ['#0a2e2e', '#00d4aa', '#ff6eb4'],
	},
];

// Decoupled from `themes[0]` so reordering the array can't silently
// move the default. Mirrors `wallpapers.ts`'s `defaultWallpaper()` /
// `default: true` pattern -- the misconfiguration manifests as a
// build-time throw rather than a silent default flip.
export const DEFAULT_THEME_ID = 'vaporwave' as const;

export const defaultTheme: Theme = (() => {
	const theme = themes.find((t) => t.id === DEFAULT_THEME_ID);
	if (!theme) {
		throw new Error(`themes.ts: no theme with id ${DEFAULT_THEME_ID}`);
	}
	return theme;
})();

export function findTheme(id: string | null | undefined): Theme | undefined {
	if (!id) return undefined;
	return themes.find((theme) => theme.id === id);
}
