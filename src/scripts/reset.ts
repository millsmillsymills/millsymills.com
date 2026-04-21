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
 * Always confirms first via the on-page modal. Refuses to wipe state if the
 * modal isn't rendered — destructive actions never fall through to silent
 * native confirms or auto-purges.
 */

const STORAGE_PREFIX = 'mills.';

export interface ResetOptions {
	/** if true, skip the confirm modal. used by callers that already confirmed. */
	skipConfirm?: boolean;
	/** override the default `/` reload target. */
	href?: string;
}

function purge(): void {
	const local: string[] = [];
	for (let i = 0; i < localStorage.length; i += 1) {
		const k = localStorage.key(i);
		if (k && k.startsWith(STORAGE_PREFIX)) local.push(k);
	}
	local.forEach((k) => localStorage.removeItem(k));

	const session: string[] = [];
	for (let i = 0; i < sessionStorage.length; i += 1) {
		const k = sessionStorage.key(i);
		if (k && k.startsWith(STORAGE_PREFIX)) session.push(k);
	}
	session.forEach((k) => sessionStorage.removeItem(k));
}

function performReset(opts: ResetOptions): void {
	try {
		purge();
	} catch (err) {
		// Loud failure: do NOT reload. Leaving the user where they are with
		// state intact is better than reloading on a half-purge and pretending
		// it worked.
		console.error('[reset] purge failed — state not cleared', err);
		return;
	}
	window.location.href = opts.href ?? '/';
}

// Modal state lives at module scope so closeModal() can tear down everything
// it set up — replaces the previous { once: true } pattern that broke on
// re-open and leaked the keydown listener after cancel.
let activeOverlay: HTMLElement | null = null;
let activeOpts: ResetOptions = {};
let onKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let onClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let triggerEl: HTMLElement | null = null;

function onYesClick(): void {
	const opts = activeOpts;
	closeModal();
	performReset(opts);
}

function onNoClick(): void {
	closeModal();
}

function openModal(overlay: HTMLElement, opts: ResetOptions, trigger: HTMLElement | null): void {
	if (activeOverlay) return;
	activeOverlay = overlay;
	activeOpts = opts;
	triggerEl = trigger;
	overlay.hidden = false;

	const yes = overlay.querySelector<HTMLButtonElement>('[data-reset-yes]');
	const no = overlay.querySelector<HTMLButtonElement>('[data-reset-no]');
	yes?.addEventListener('click', onYesClick);
	no?.addEventListener('click', onNoClick);

	onKeyHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeModal();
		} else if (e.key === 'Enter') {
			// Only confirm if focus is inside the modal. A future surface
			// that focuses an <input> while the modal is open (e.g. flag
			// submit) shouldn't have its Enter wipe state.
			if (!activeOverlay?.contains(document.activeElement)) return;
			e.preventDefault();
			onYesClick();
		}
	};
	window.addEventListener('keydown', onKeyHandler);

	onClickOutsideHandler = (e: MouseEvent) => {
		if (e.target === overlay) closeModal();
	};
	overlay.addEventListener('click', onClickOutsideHandler);

	// Focus the safe default. Cancel rather than Yes so that an accidental
	// space/enter on a freshly-focused control doesn't wipe state.
	no?.focus();
}

function closeModal(): void {
	if (!activeOverlay) return;
	const overlay = activeOverlay;
	const yes = overlay.querySelector<HTMLButtonElement>('[data-reset-yes]');
	const no = overlay.querySelector<HTMLButtonElement>('[data-reset-no]');
	yes?.removeEventListener('click', onYesClick);
	no?.removeEventListener('click', onNoClick);
	if (onKeyHandler) window.removeEventListener('keydown', onKeyHandler);
	if (onClickOutsideHandler) overlay.removeEventListener('click', onClickOutsideHandler);
	onKeyHandler = null;
	onClickOutsideHandler = null;
	overlay.hidden = true;
	activeOverlay = null;
	activeOpts = {};
	if (triggerEl) {
		if (document.contains(triggerEl)) {
			triggerEl.focus();
		} else {
			// Trigger was removed from the DOM while the modal was open
			// (window closed, route change). Focus falls back to <body>;
			// log so we notice during dev.
			console.debug('[reset] trigger gone; focus restored to <body>');
		}
	}
	triggerEl = null;
}

export function resetAll(opts: ResetOptions = {}): void {
	if (opts.skipConfirm) {
		performReset(opts);
		return;
	}
	const overlay = document.querySelector<HTMLElement>('.reset-confirm');
	if (!overlay) {
		console.error('[reset] confirm modal not found on this page; refusing to wipe state');
		return;
	}
	openModal(overlay, opts, null);
}

function init(): void {
	// Idempotency guard. If init() runs twice (HMR, dual bundle, multiple
	// inline <script> tags) without this, every trigger click would dispatch
	// through two delegated handlers — openModal's `if (activeOverlay)` masks
	// the symptom but the underlying double-bind is still wrong.
	const w = window as unknown as {
		mills?: Record<string, unknown> & { __resetInit?: true };
	};
	if (w.mills?.__resetInit) return;

	// Event delegation handles dynamically-mounted triggers (e.g. windows that
	// hydrate after DOMContentLoaded) without requiring re-binding on every
	// app open.
	document.addEventListener('click', (e) => {
		const target = e.target as HTMLElement | null;
		const trigger = target?.closest<HTMLElement>('[data-reset-trigger]');
		if (!trigger) return;
		e.preventDefault();
		e.stopPropagation();
		const overlay = document.querySelector<HTMLElement>('.reset-confirm');
		if (!overlay) {
			console.error('[reset] confirm modal not found; refusing to wipe state');
			return;
		}
		openModal(overlay, {}, trigger);
	});

	Object.assign((w.mills ??= {}), { reset: resetAll, __resetInit: true });
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}
