/*
 * Reset everything mills-flavored back to first-load state:
 *   - desktop window positions + open set    (mills.desktop.v1)
 *   - mobile shell current app               (mills.mobile.v1)
 *   - captured CTF flags                     (mills.flags.v1)
 *   - boot-animation seen flag               (mills.boot.played, sessionStorage)
 *   - any other key starting with `mills.`   (future-proofing)
 *
 * Triggers (any of):
 *   - terminal `reset` command
 *   - start-menu "reset desktop" entry
 *   - "clear progress" button inside flags.exe
 *   - `window.mills.reset()` from devtools
 *
 * Always confirms first. Reloads the page after wiping so every
 * controller re-initializes from the clean slate.
 */

const STORAGE_PREFIX = 'mills.';

function purge(): void {
	try {
		const local: string[] = [];
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && k.startsWith(STORAGE_PREFIX)) local.push(k);
		}
		local.forEach((k) => localStorage.removeItem(k));
	} catch {
		/* localStorage might be disabled — ignore */
	}
	try {
		const session: string[] = [];
		for (let i = 0; i < sessionStorage.length; i += 1) {
			const k = sessionStorage.key(i);
			if (k && k.startsWith(STORAGE_PREFIX)) session.push(k);
		}
		session.forEach((k) => sessionStorage.removeItem(k));
	} catch {
		/* noop */
	}
}

export interface ResetOptions {
	/** if true, skip the confirm modal. used by callers that already confirmed. */
	skipConfirm?: boolean;
	/** override the default `/` reload target. */
	href?: string;
}

export function resetAll(opts: ResetOptions = {}): void {
	const proceed = opts.skipConfirm ? true : confirmReset();
	if (!proceed) return;
	purge();
	window.location.href = opts.href ?? '/';
}

function confirmReset(): boolean {
	const overlay = document.querySelector<HTMLElement>('.reset-confirm');
	if (overlay) {
		// modal-driven flow — open it and let buttons handle the resolution
		openModal(overlay);
		return false;
	}
	// fallback to native confirm if the modal isn't on the page
	return window.confirm(
		'reset desktop?\n\n' +
			'this will clear:\n' +
			'  · open windows + their positions\n' +
			'  · captured CTF flags (all 10)\n' +
			'  · last-open mobile app\n' +
			'  · boot-animation skip\n\n' +
			'no way back. continue?',
	);
}

function openModal(overlay: HTMLElement): void {
	overlay.hidden = false;
	const close = () => {
		overlay.hidden = true;
	};
	const onConfirm = () => {
		close();
		resetAll({ skipConfirm: true });
	};

	const yes = overlay.querySelector<HTMLButtonElement>('[data-reset-yes]');
	const no = overlay.querySelector<HTMLButtonElement>('[data-reset-no]');
	yes?.addEventListener('click', onConfirm, { once: true });
	no?.addEventListener('click', close, { once: true });

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			close();
			window.removeEventListener('keydown', onKey);
		} else if (e.key === 'Enter') {
			window.removeEventListener('keydown', onKey);
			onConfirm();
		}
	};
	window.addEventListener('keydown', onKey);

	overlay.addEventListener(
		'click',
		(e) => {
			if (e.target === overlay) close();
		},
		{ once: true },
	);
}

function init(): void {
	// Wire any [data-reset-trigger] elements to call resetAll().
	document.querySelectorAll<HTMLElement>('[data-reset-trigger]').forEach((el) => {
		el.addEventListener('click', (e) => {
			e.preventDefault();
			resetAll();
		});
	});

	// Expose to window.mills for devtools convenience.
	const w = window as unknown as { mills?: Record<string, unknown> };
	w.mills = { ...(w.mills ?? {}), reset: resetAll };
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
