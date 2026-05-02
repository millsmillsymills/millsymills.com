/*
 * Desktop right-click → custom context menu.
 *
 * Only intercepts native contextmenu events when the click target is
 * the empty desktop surface (the .desktop element itself, the sparkle
 * layer, or the icon-list whitespace). Right-clicks inside a window,
 * on an icon, on the taskbar, or on any focusable form element fall
 * through to the browser's default menu — that's where users want
 * native copy/paste/etc.
 *
 * Items dispatch via existing data-* hooks (data-open-window for the
 * picker, data-reset-trigger for the reset modal) so the menu doesn't
 * own its own action wiring — window-manager.ts and reset.ts pick the
 * clicks up automatically since the menu element is in the DOM at
 * construction time.
 */

const PASS_THROUGH_SELECTOR =
	'.window, .desktop-icon, .taskbar, .start-menu, .help, .reset-confirm, .cmdp, .clippy, input, textarea, select, [contenteditable="true"], a';

let menu: HTMLElement | null = null;
let initialized = false;

function clamp(value: number, max: number): number {
	return Math.max(0, Math.min(value, max));
}

function position(menu: HTMLElement, clientX: number, clientY: number): void {
	// Show first so we can measure, then clamp into the viewport.
	menu.hidden = false;
	const rect = menu.getBoundingClientRect();
	const left = clamp(clientX, window.innerWidth - rect.width - 4);
	const top = clamp(clientY, window.innerHeight - rect.height - 4);
	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
}

function close(): void {
	if (!menu) return;
	menu.hidden = true;
}

function onContextMenu(e: MouseEvent): void {
	const target = e.target as HTMLElement | null;
	if (!target) return;
	// Right-click inside the open menu is a no-op (don't re-position under the
	// new cursor coords, don't fall through to the browser's native menu on a
	// menu button — both are jarring).
	if (target.closest('.ctx-menu')) {
		e.preventDefault();
		return;
	}
	if (target.closest(PASS_THROUGH_SELECTOR)) return;
	const desktop = target.closest('.desktop');
	if (!desktop) return;

	e.preventDefault();
	if (!menu) return;
	position(menu, e.clientX, e.clientY);

	const first = menu.querySelector<HTMLButtonElement>('button');
	first?.focus();
}

function init(): void {
	// Idempotency guard. If init() runs twice (HMR, dual bundle, multiple
	// inline <script> tags) without this, every document/window listener
	// below would stack with fresh function refs that addEventListener can't
	// dedupe. Module-local rather than window.mills.* because DesktopLayout's
	// inline <script> reassigns window.mills wholesale at parse time and
	// would clobber a shared flag.
	if (initialized) return;

	menu = document.querySelector<HTMLElement>('.ctx-menu');
	if (!menu) return;

	document.addEventListener('contextmenu', onContextMenu);

	// Close on click (not mousedown). The handlers that act on these
	// items — window-manager.ts (per-element click on each
	// [data-open-window]) and reset.ts (delegated click on document for
	// [data-reset-trigger]) — both listen for `click`. Closing on
	// mousedown hides the button before mouseup lands, so no click ever
	// synthesizes against it. Closing on click means the button's click
	// fires first (target phase / bubbles through menu → close runs on
	// bubble → continues to document → reset's delegated handler), so
	// by the time any new window paints, the menu is already gone.
	menu.addEventListener('click', close);

	document.addEventListener('mousedown', (e) => {
		if (menu?.hidden) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest('.ctx-menu')) return;
		close();
	});

	window.addEventListener('keydown', (e) => {
		if (menu?.hidden) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	});

	// A scroll/resize while the menu is open repositions it awkwardly;
	// just close it.
	window.addEventListener('scroll', close, { passive: true });
	window.addEventListener('resize', close);

	initialized = true;
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
