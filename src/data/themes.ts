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

export const defaultTheme = themes[0];

export function findTheme(id: string | null): Theme | undefined {
	return themes.find((theme) => theme.id === id);
}
