/*
 * Meme image 404 → placeholder swap for /memes/.
 *
 * CSP forbids inline `onerror=` (script-src 'self' with no 'unsafe-inline'),
 * so the swap is wired up here. If a meme image 404s, hide it and reveal
 * the sibling `.memes__placeholder` div.
 *
 * External module so the production CSP `script-src 'self'` allows it —
 * see #129/#231.
 */

function init(): void {
	document.querySelectorAll<HTMLImageElement>('img.memes__img').forEach((img) => {
		const placeholder = img.nextElementSibling as HTMLElement | null;
		if (!placeholder?.classList.contains('memes__placeholder')) return;
		const swap = () => {
			img.style.display = 'none';
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
