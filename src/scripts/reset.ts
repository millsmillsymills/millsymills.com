/*
 * Reset everything mills-flavored back to first-load state:
 *   - desktop window positions + open set    (mills.desktop.v1)
 *   - captured CTF flags                     (mills.flags.v1)
 *   - boot-animation seen flag               (mills.boot.played, sessionStorage)
 *   - vscode.exe open tabs + active tab      (mills.vscode.v1)
 *   - any other key starting with `mills.`   (future-proofing — sweeps
 *     legacy keys like `mills.mobile.v1` from older builds too)
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

import { dispatchClippyTrigger, dispatchPlaySound } from './util/events';

const STORAGE_PREFIX = 'mills.';
const SHUTDOWN_HOLD_MS = 2400;

export interface ResetOptions {
	/** if true, skip the confirm modal. used by callers that already confirmed. */
	skipConfirm?: boolean;
	/** override the default `/` reload target. */
	href?: string;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined'
		&& typeof window.matchMedia === 'function'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

// Reveal the full-screen "simulation ended" overlay if the page rendered one
// AND the user hasn't asked for reduced motion. Returns whether the caller
// should wait for the hold before reloading. Caller must already have purged
// state — overlay-then-reload is purely cosmetic; the destructive work is done.
function showShutdownOverlay(): boolean {
	const overlay = document.querySelector<HTMLElement>('[data-shutdown-overlay]');
	if (!overlay || prefersReducedMotion()) return false;
	overlay.hidden = false;
	// Two rAFs so the un-hide commits to layout before the class-add starts the
	// CSS transition; without it the overlay snaps in with no fade.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => overlay.classList.add('shutdown-overlay--on'));
	});
	return true;
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
	const target = opts.href ?? '/';
	// Purge has already committed; the overlay+hold is a cosmetic farewell.
	// If the user closes the tab mid-animation, state is already gone.
	if (showShutdownOverlay()) {
		window.setTimeout(() => {
			window.location.href = target;
		}, SHUTDOWN_HOLD_MS);
		return;
	}
	window.location.href = target;
}

// Modal state lives at module scope so closeModal() can tear down everything
// it set up — replaces the previous { once: true } pattern that broke on
// re-open and leaked the keydown listener after cancel.
let activeOverlay: HTMLElement | null = null;
let activeOpts: ResetOptions = {};
let onKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let onClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let triggerEl: HTMLElement | null = null;
// Snapshotted at openModal so a user who re-opens the start menu while
// the modal is up doesn't unhide the trigger out from under us — focus
// would otherwise land back inside the now-open menu they navigated
// away from. Pairs with the same closest('[hidden]') check at close
// time so we still detect a trigger whose ancestor became hidden.
let triggerWasFocusable = false;

function onYesClick(): void {
	const opts = activeOpts;
	closeModal();
	dispatchPlaySound('reset');
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
	triggerWasFocusable =
		trigger !== null && document.contains(trigger) && trigger.closest('[hidden]') === null;
	overlay.hidden = false;
	dispatchClippyTrigger('reset');

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
		// `document.contains` is true even when the trigger sits inside a
		// `[hidden]` ancestor (the right-click menu's <ul>, the start
		// menu's <div>) — `.focus()` then silently no-ops and focus
		// collapses to <body>. Catches the `hidden` HTML attribute only,
		// not CSS-based hiding (`display:none`, `visibility:hidden`,
		// `inert`); those don't trigger the regression today.
		const triggerFocusable =
			triggerWasFocusable
			&& document.contains(triggerEl)
			&& triggerEl.closest('[hidden]') === null;
		if (triggerFocusable) {
			triggerEl.focus();
		} else {
			// `[data-focus-fallback]` is the cross-component contract for
			// "focus this when nothing better is available" — the BEM class
			// `.taskbar__start` stays internal to the Taskbar stylesheet.
			const fallback = document.querySelector<HTMLElement>('[data-focus-fallback]');
			if (fallback) {
				fallback.focus();
				if (document.activeElement !== fallback) {
					console.debug(
						'[reset] fallback .focus() did not land; focus collapsed to <body>',
					);
				}
			} else {
				console.debug('[reset] trigger gone and no fallback; focus restored to <body>');
			}
		}
	}
	triggerEl = null;
	triggerWasFocusable = false;
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
	if (window.mills?.__resetInit) return;

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

	// `reset` is advertised in src/scripts/flags.ts:consoleBanner — rename
	// in lockstep, no compile-time link.
	Object.assign((window.mills ??= {}), { reset: resetAll, __resetInit: true });
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}
