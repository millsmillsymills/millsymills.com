/*
 * About avatar rotation. Picks one headshot at random per page load from the
 * `data-frames` list and swaps it in. The SSR-rendered `src` is the default
 * frame, so the no-JS / pre-hydration view still shows a real headshot, and a
 * missing frame still falls through to about-avatar-fallback's 404 handler.
 *
 * A single pick per load is not motion, so there's nothing to gate on
 * `prefers-reduced-motion` — the avatar never auto-advances.
 *
 * Loaded as an external module (not inline) so the production CSP
 * `script-src 'self'` allows it — see #129/#231/#647.
 */

function pickFrame(img: HTMLImageElement): void {
	const raw = img.dataset['frames'];
	if (!raw) return;
	let frames: unknown;
	try {
		frames = JSON.parse(raw);
	} catch {
		return;
	}
	if (!Array.isArray(frames) || frames.length === 0) return;
	const choice = frames[Math.floor(Math.random() * frames.length)];
	if (typeof choice === 'string' && choice !== img.getAttribute('src')) {
		img.src = choice;
	}
}

function init(): void {
	const img = document.querySelector<HTMLImageElement>('img.about__avatar[data-frames]');
	if (img) pickFrame(img);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
