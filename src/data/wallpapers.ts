// Single source of truth for the wallpaper picker.
//
// Drop new images into public/images/wallpapers/ + a corresponding
// thumbnail into public/images/wallpapers/thumb/ and add an entry
// here. The first entry flagged `default: true` is what unconfigured
// visitors see; exactly one entry must carry that flag.
//
// Both the Display picker UI and the wallpaper-init bootstrap import
// from this file, so they always agree on what's available.

export interface Wallpaper {
	readonly id: string;
	readonly label: string;
	readonly src: string;
	readonly thumbnail: string;
	readonly default?: boolean;
}

export const wallpapers: readonly Wallpaper[] = [
	{
		id: 'default',
		label: 'mills classic',
		src: '/images/desktop-background.jpg',
		thumbnail: '/images/wallpapers/thumb/default.jpg',
		default: true,
	},
	{
		id: 'arizona',
		label: 'arizona iced tea',
		src: '/images/wallpapers/wallhaven-3krpgd.jpg',
		thumbnail: '/images/wallpapers/thumb/wallhaven-3krpgd.jpg',
	},
	{
		id: 'error-cloud',
		label: 'error cloud',
		src: '/images/wallpapers/wallhaven-d6zqvg.jpg',
		thumbnail: '/images/wallpapers/thumb/wallhaven-d6zqvg.jpg',
	},
	{
		id: 'horizon',
		label: 'keep going',
		src: '/images/wallpapers/wallhaven-j3q3kp.jpg',
		thumbnail: '/images/wallpapers/thumb/wallhaven-j3q3kp.jpg',
	},
	{
		id: 'sailor-moon',
		label: 'sailor moon',
		src: '/images/wallpapers/wallhaven-yj1lxx.jpg',
		thumbnail: '/images/wallpapers/thumb/wallhaven-yj1lxx.jpg',
	},
	{
		id: 'win98-dissolve',
		label: 'windows 98',
		src: '/images/wallpapers/wallhaven-ymw3dl.jpg',
		thumbnail: '/images/wallpapers/thumb/wallhaven-ymw3dl.jpg',
	},
];

export function findWallpaper(id: string | null | undefined): Wallpaper | undefined {
	if (!id) return undefined;
	return wallpapers.find((w) => w.id === id);
}

export function defaultWallpaper(): Wallpaper {
	const fallback = wallpapers.find((w) => w.default);
	if (!fallback) {
		throw new Error('wallpapers.ts: exactly one entry must carry `default: true`.');
	}
	return fallback;
}
