// Everything in this system moves in steps, never smooth — CRT grammar.
export function steps(value: number, n = 8): number {
	return Math.floor(value * n) / n;
}

// Per-frame flicker; sin-hash keeps it deterministic so renders reproduce.
export function flicker(frame: number, seed = 0): number {
	const x = Math.sin((frame + seed) * 12.9898) * 43758.5453;
	const r = x - Math.floor(x);
	return r < 0.12 ? 0.82 : 1;
}
