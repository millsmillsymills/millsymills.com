// Mirrors src/styles/desktop.css :root tokens — keep in sync by hand
// (video/ has no build-time access to the site's CSS custom properties).
export const PALETTE = {
	void: '#0a0320',
	deep: '#140832',
	pink: '#ff4fa8',
	cyan: '#00e5ff',
	lilac: '#c8a8ff',
	cream: '#f5edff',
} as const;

export type Tint = 'pink' | 'cyan' | 'none';
