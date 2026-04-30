/*
 * Avatar 404 → placeholder swap for /about/.
 *
 * CSP forbids inline `onerror=` (script-src 'self' with no 'unsafe-inline'),
 * so the swap is wired up here. If the avatar 404s, hide it and reveal the
 * sibling `.about__avatar--placeholder` div.
 *
 * Loaded as an external module from About.astro so the production CSP
 * `script-src 'self'` actually allows it — see #129/#231 for context.
 */

function init(): void {
	document.querySelectorAll<HTMLImageElement>('img.about__avatar').forEach((img) => {
		const placeholder = img.nextElementSibling as HTMLElement | null;
		if (!placeholder?.classList.contains('about__avatar--placeholder')) return;
		const swap = () => {
			img.hidden = true;
			placeholder.removeAttribute('hidden');
		};
		if (img.complete && img.naturalWidth === 0) swap();
		else img.addEventListener('error', swap, { once: true });
	});
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
