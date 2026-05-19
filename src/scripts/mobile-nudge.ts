/*
 * Mobile-shell desktop nudge (#397).
 *
 * Shows the `data-mobile-nudge` banner once per session on the mobile
 * shell. Dismissable via the inline close button. Dismissal persists
 * in sessionStorage so a single page refresh doesn't re-show it, but
 * a fresh tab session does — the nudge is information about the site's
 * intended surface, not a tracking concession to phone users.
 *
 * Clippy (`src/scripts/clippy.ts`) bails on `hover: none`, so the
 * desktop-only nudge surface never reaches mobile viewers. This banner
 * is the mobile-shell equivalent.
 */

export const STORAGE_KEY = 'mills.mobile-nudge.dismissed';

function isDismissed(): boolean {
	try {
		return sessionStorage.getItem(STORAGE_KEY) === '1';
	} catch (err) {
		console.warn('[mills.mobile-nudge] sessionStorage read failed', err);
		return false;
	}
}

function persistDismissed(): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, '1');
	} catch (err) {
		// Storage disabled -- the banner hides for this view but reappears
		// on the next render. Acceptable degradation.
		console.warn('[mills.mobile-nudge] sessionStorage write failed', err);
	}
}

export function init(): void {
	if (isDismissed()) return;

	const banner = document.querySelector<HTMLElement>('[data-mobile-nudge]');
	if (!banner) return;
	banner.hidden = false;

	const closeBtn = banner.querySelector<HTMLButtonElement>(
		'[data-mobile-nudge-dismiss]',
	);
	closeBtn?.addEventListener('click', () => {
		banner.hidden = true;
		persistDismissed();
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
