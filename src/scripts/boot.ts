/*
 * CRT power-on intro. Runs exactly once per tab — suppressed after
 * the first playthrough (sessionStorage) so in-tab navigation and
 * per-app permalink routes don't replay it. Skipped entirely when
 * the user prefers reduced motion.
 */

const SESSION_KEY = 'mills.boot.played';

function shouldPlay(): boolean {
	try {
		if (sessionStorage.getItem(SESSION_KEY)) return false;
	} catch {
		return false;
	}
	try {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
	} catch {
		/* noop */
	}
	return true;
}

function markPlayed(): void {
	try {
		sessionStorage.setItem(SESSION_KEY, '1');
	} catch {
		/* noop */
	}
}

function init(): void {
	const overlay = document.querySelector<HTMLElement>('.boot-overlay');
	if (!overlay) return;

	if (!shouldPlay()) {
		overlay.remove();
		return;
	}

	overlay.classList.add('boot-overlay--on');
	markPlayed();

	const finish = () => {
		overlay.classList.add('boot-overlay--done');
		// Notify subscribers (e.g. Clippy) that the boot animation is finished
		// and the desktop is interactive.
		window.dispatchEvent(new CustomEvent('mills:boot-done'));
		setTimeout(() => overlay.remove(), 600);
	};

	// allow click-to-skip
	overlay.addEventListener('click', finish, { once: true });

	setTimeout(finish, 1400);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
