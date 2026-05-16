/*
 * Tiny vanilla-TS window manager for the desktop.
 *
 * Picks up every .window in the DOM and wires:
 *   - desktop icons / start menu items / taskbar items as openers
 *   - title-bar drag (pointer events, no library)
 *   - focus stacking via z-index
 *   - close, minimize, maximize controls
 *   - a clock in the taskbar
 *   - position + open-set persistence in localStorage
 *
 * Intentionally framework-free.
 */

import { isAppId } from '../data/apps';
import { dispatchClippyTrigger, dispatchPlaySound } from './util/events';

const STORAGE_KEY = 'mills.desktop.v1';
const Z_BASE = 100;

// Window geometry guards. These mirror `.window` and `.window--maximized`
// in src/styles/desktop.css; if you change one side, change the others.
// CSS is the binding constraint at render time — the JS clamps exist so
// the inline width/height the resize handler writes never exceeds what
// CSS will draw, otherwise the cursor decouples from the grip near edges.
//
// .window: min-width 280px, min-height 180px,
//          max-width calc(100vw - 32px), max-height calc(100vh - 96px)
//   → 16px reserved on each side; 16px top + 80px bottom (taskbar lives
//     in the bottom strip).
const WINDOW_MIN_W = 280;
const WINDOW_MIN_H = 180;
const VIEWPORT_MARGIN_X = 16;
const VIEWPORT_MARGIN_TOP = 16;
const VIEWPORT_MARGIN_BOTTOM = 80;

// Window geometry as a pair (always present together).
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

// Discriminated union: a window is either at its restored geometry, or
// maximized with the prior geometry tucked away so unmaximize knows where
// to return to. The boolean+geometry pairing the previous shape used
// allowed `{maximized: true, x:0, y:0, w:0, h:0}` to mean nothing in
// particular; the ADT shape rejects that at the type level. (#57 sub-3)
type WindowState =
	| { kind: 'restored'; rect: Rect }
	| { kind: 'maximized'; prior: Rect };

type DesktopState = {
	open: string[]; // currently-open window ids in z-order (last = top)
	windows: Record<string, WindowState>;
};

function isFiniteNumber(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

function isValidRect(v: unknown): v is Rect {
	if (!v || typeof v !== 'object') return false;
	const r = v as Record<string, unknown>;
	return isFiniteNumber(r.x) && isFiniteNumber(r.y) && isFiniteNumber(r.w) && isFiniteNumber(r.h);
}

function isValidWindowState(v: unknown): v is WindowState {
	if (!v || typeof v !== 'object') return false;
	const s = v as Record<string, unknown>;
	if (s.kind === 'restored') return isValidRect(s.rect);
	if (s.kind === 'maximized') return isValidRect(s.prior);
	return false;
}

function rectOfElement(el: HTMLElement): Rect {
	const r = el.getBoundingClientRect();
	return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function applyRect(el: HTMLElement, rect: Rect): void {
	el.style.left = `${clamp(rect.x, 0, window.innerWidth - 80)}px`;
	el.style.top = `${clamp(rect.y, 0, window.innerHeight - 60)}px`;
	if (rect.w) el.style.width = `${rect.w}px`;
	if (rect.h) el.style.height = `${rect.h}px`;
}

/**
 * Migrate the legacy `{x, y, w, h, maximized}` shape (mills.desktop.v1
 * before this PR) to the discriminated-union shape. Old persistence is
 * upgraded in place on the next save; nothing is lost. Returns null for
 * shapes that are neither legacy nor current — those get dropped with a
 * warn at the call site.
 */
function migrateLegacyWindowState(v: unknown): WindowState | null {
	if (!v || typeof v !== 'object') return null;
	const s = v as Record<string, unknown>;
	if (
		isFiniteNumber(s.x) &&
		isFiniteNumber(s.y) &&
		isFiniteNumber(s.w) &&
		isFiniteNumber(s.h) &&
		typeof s.maximized === 'boolean'
	) {
		const rect: Rect = { x: s.x, y: s.y, w: s.w, h: s.h };
		return s.maximized ? { kind: 'maximized', prior: rect } : { kind: 'restored', rect };
	}
	return null;
}

function loadState(): DesktopState {
	let raw: string | null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch (err) {
		console.warn('[mills.desktop] localStorage.getItem failed', err);
		return { open: [], windows: {} };
	}
	if (!raw) return { open: [], windows: {} };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		console.warn('[mills.desktop] state JSON parse failed; resetting', err);
		return { open: [], windows: {} };
	}
	if (!parsed || typeof parsed !== 'object') {
		return { open: [], windows: {} };
	}

	const p = parsed as { open?: unknown; windows?: unknown };
	const open = Array.isArray(p.open) ? p.open.filter((id): id is string => typeof id === 'string') : [];

	// Validate each WindowState. Drop entries with non-finite numerics or
	// unrecognized shape; old `{x,y,w,h,maximized}` entries (pre-#57 sub-3)
	// are migrated to the new discriminated-union shape on the fly.
	const windows: Record<string, WindowState> = {};
	if (p.windows && typeof p.windows === 'object') {
		for (const [id, val] of Object.entries(p.windows as Record<string, unknown>)) {
			if (isValidWindowState(val)) {
				windows[id] = val;
				continue;
			}
			const migrated = migrateLegacyWindowState(val);
			if (migrated) {
				windows[id] = migrated;
			} else {
				console.warn('[mills.desktop] dropping invalid windows[%s]', id, val);
			}
		}
	}
	return { open, windows };
}

function saveState(state: DesktopState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		// QuotaExceededError, Safari ITP, private browsing — visible state
		// changes won't persist across reloads. Loud breadcrumb so devtools
		// shows the actual cause.
		console.warn('[mills.desktop] localStorage.setItem failed', err);
	}
}

class WindowManager {
	private state: DesktopState = loadState();
	private windows: Map<string, HTMLElement> = new Map();
	private taskbarItems: HTMLUListElement | null = null;

	constructor() {
		this.collectWindows();
		this.taskbarItems = document.querySelector('.taskbar__items');
		this.bindOpeners();
		this.bindWindows();
		this.bindStartMenu();
		this.bindClock();
		this.bindExternalCloseEvent();
		this.restore();
	}

	// ----------------------------------------------------------------
	// setup

	private collectWindows() {
		document.querySelectorAll<HTMLElement>('.window').forEach((el) => {
			const id = el.dataset.windowId;
			if (!id) return;
			this.windows.set(id, el);
		});
	}

	private bindOpeners() {
		document.querySelectorAll<HTMLElement>('[data-open-window]').forEach((el) => {
			el.addEventListener('click', (e) => {
				e.preventDefault();
				const id = el.dataset.openWindow;
				if (id) this.open(id);
			});
		});
	}

	private bindWindows() {
		this.windows.forEach((el, id) => {
			const titlebar = el.querySelector<HTMLElement>('.window__titlebar');
			titlebar?.addEventListener('pointerdown', (e) => this.startDrag(e, id, el));

			const grip = el.querySelector<HTMLElement>('.window__resize-grip');
			grip?.addEventListener('pointerdown', (e) => this.startResize(e, id, el));

			el.addEventListener('pointerdown', () => this.focus(id));

			el.querySelector<HTMLButtonElement>('.window-control--close')?.addEventListener(
				'click',
				(e) => {
					e.stopPropagation();
					this.close(id);
				},
			);

			el.querySelector<HTMLButtonElement>('.window-control--hide')?.addEventListener(
				'click',
				(e) => {
					e.stopPropagation();
					this.close(id);
				},
			);

			el.querySelector<HTMLButtonElement>('.window-control--max')?.addEventListener(
				'click',
				(e) => {
					e.stopPropagation();
					this.toggleMax(id);
				},
			);
		});
	}

	// External callers (e.g. terminal `exit` command) request a close via this
	// event so they don't have to hold a reference to the WindowManager
	// instance — and so the taskbar / state.open are kept in sync. Mutating
	// .hidden directly leaves stale entries; #51. Event shape is declared in
	// util/events.ts so the callback parameter is auto-typed.
	private bindExternalCloseEvent() {
		document.addEventListener('mills:close-window', (ev) => {
			this.close(ev.detail.id);
		});
	}

	private bindStartMenu() {
		const start = document.querySelector<HTMLButtonElement>('.taskbar__start');
		const menu = document.querySelector<HTMLElement>('.start-menu');
		if (!start || !menu) return;

		start.addEventListener('click', (e) => {
			e.stopPropagation();
			menu.hidden = !menu.hidden;
		});
		document.addEventListener('click', (e) => {
			if (menu.hidden) return;
			if (e.target instanceof Node && (menu.contains(e.target) || start.contains(e.target))) {
				return;
			}
			menu.hidden = true;
		});
		menu.querySelectorAll<HTMLElement>('[data-open-window]').forEach((el) => {
			el.addEventListener('click', () => {
				menu.hidden = true;
			});
		});
	}

	private bindClock() {
		const clock = document.querySelector<HTMLElement>('.taskbar__clock');
		if (!clock) return;
		const tick = () => {
			const d = new Date();
			const hh = d.getHours().toString().padStart(2, '0');
			const mm = d.getMinutes().toString().padStart(2, '0');
			clock.textContent = `${hh}:${mm}`;
		};
		tick();
		setInterval(tick, 30_000);
	}

	private restore() {
		// Reopen windows that were open in the previous session, in their saved
		// positions and z-order. Then honor any ?open=<id1>,<id2> deep-link
		// from the URL, and finally any initial-open baked into the server-
		// rendered <body data-initial-open="..."> (per-app permalink routes).
		// Later sources land on top of earlier ones.
		//
		// `silent: true` for every restore path — Clippy already speaks
		// once at boot via the wakeup trigger; firing the `open` trigger
		// for each restored window would stack 1-N quips on first paint.
		const open = [...this.state.open];
		this.state.open = [];
		open.forEach((id) => this.open(id, { skipPosition: false, silent: true }));

		try {
			const params = new URLSearchParams(window.location.search);
			const requested = params.get('open');
			if (requested) {
				requested
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
					.forEach((id) => this.open(id, { silent: true }));
			}
		} catch (err) {
			console.warn('[mills.desktop] failed to read ?open= query param', err);
		}

		const bodyInitial = document.body?.dataset.initialOpen;
		if (bodyInitial) this.open(bodyInitial, { silent: true });
	}

	// ----------------------------------------------------------------
	// behaviors

	private open(id: string, opts: { skipPosition?: boolean; silent?: boolean } = {}) {
		const el = this.windows.get(id);
		if (!el) return;

		// Snapshot before mutating so the clippy 'open' trigger only fires
		// for a true open, not a focus-raise on an already-open window.
		const wasOpen = this.state.open.includes(id);

		el.hidden = false;
		if (!opts.skipPosition) this.restorePosition(id, el);

		// Move id to the top of the open list.
		this.state.open = this.state.open.filter((x) => x !== id);
		this.state.open.push(id);

		this.applyZ();
		this.renderTaskbar();
		this.persist();

		if (!opts.silent && !wasOpen) {
			dispatchClippyTrigger('open', isAppId(id) ? id : undefined);
			dispatchPlaySound('open');
		}
	}

	private close(id: string) {
		const el = this.windows.get(id);
		if (!el) return;
		// Gate the clippy 'close' trigger on the prior open state — an
		// external mills:close-window dispatched twice should not fire two
		// quips for one user-visible close.
		const wasOpen = this.state.open.includes(id);
		el.hidden = true;
		this.state.open = this.state.open.filter((x) => x !== id);
		this.renderTaskbar();
		this.persist();

		if (wasOpen) {
			dispatchClippyTrigger('close', isAppId(id) ? id : undefined);
			dispatchPlaySound('close');
		}
	}

	private focus(id: string) {
		if (!this.state.open.includes(id)) return;
		const top = this.state.open[this.state.open.length - 1];
		if (top === id) return;
		this.state.open = this.state.open.filter((x) => x !== id);
		this.state.open.push(id);
		this.applyZ();
		this.renderTaskbar();
		this.persist();
	}

	private toggleMax(id: string) {
		const el = this.windows.get(id);
		if (!el) return;
		const current = this.state.windows[id];
		if (current && current.kind === 'maximized') {
			// Restore: pop the prior rect, drop the maximized class.
			el.classList.remove('window--maximized');
			this.state.windows[id] = { kind: 'restored', rect: current.prior };
			applyRect(el, current.prior);
		} else {
			// Maximize: capture current geometry as the prior, set kind. If we
			// don't have a saved rect (never moved/dragged), capture from the
			// live element first so unmaximize has somewhere to return to.
			const prior = current ? current.rect : rectOfElement(el);
			this.state.windows[id] = { kind: 'maximized', prior };
			el.classList.add('window--maximized');
		}
		this.persist();
	}

	private applyZ() {
		this.state.open.forEach((id, i) => {
			const el = this.windows.get(id);
			if (el) el.style.zIndex = String(Z_BASE + i);
		});
	}

	private renderTaskbar() {
		if (!this.taskbarItems) return;
		this.taskbarItems.innerHTML = '';
		const top = this.state.open[this.state.open.length - 1];
		this.state.open.forEach((id) => {
			const el = this.windows.get(id);
			if (!el) return;
			const title = el.dataset.windowTitle ?? id;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'taskbar-item';
			if (id === top) btn.classList.add('taskbar-item--active');
			btn.textContent = title;
			btn.addEventListener('click', () => this.focus(id));
			this.taskbarItems!.appendChild(btn);
		});
	}

	// ----------------------------------------------------------------
	// drag

	private startDrag(e: PointerEvent, id: string, el: HTMLElement) {
		// Don't start drag from the controls cluster.
		if (e.target instanceof HTMLElement && e.target.closest('.window-control')) return;
		if (el.classList.contains('window--maximized')) return;

		this.focus(id);

		const rect = el.getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;
		const titlebar = e.currentTarget as HTMLElement;
		titlebar.setPointerCapture(e.pointerId);

		const onMove = (ev: PointerEvent) => {
			// Filter by pointerId — document-bound listeners can otherwise
			// receive events from a second concurrent pointer (multitouch).
			if (ev.pointerId !== e.pointerId) return;
			const x = clamp(ev.clientX - offsetX, 0, window.innerWidth - 80);
			const y = clamp(ev.clientY - offsetY, 0, window.innerHeight - 60);
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;
		};

		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			// Capture may already have been lost (devtools open, alt-tab,
			// some Safari edge cases). Calling releasePointerCapture without
			// hasPointerCapture throws InvalidStateError; guard explicitly.
			if (titlebar.hasPointerCapture(e.pointerId)) {
				titlebar.releasePointerCapture(e.pointerId);
			}
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointercancel', onUp);
			this.savePosition(id, el);
		};

		// Bind on document, not titlebar. setPointerCapture usually keeps
		// events flowing to the titlebar, but if the browser releases capture
		// early the user-visible symptom is a window stuck to the cursor with
		// no pointerup ever firing. document-bound listeners survive that.
		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp);
		document.addEventListener('pointercancel', onUp);
	}

	private startResize(e: PointerEvent, id: string, el: HTMLElement) {
		// Maximized windows have their geometry pinned by !important — resizing
		// them would race the CSS. Restore first; the grip is also display:none
		// in that state, so this is a defense-in-depth check.
		if (el.classList.contains('window--maximized')) return;

		// Bring focus + stop click-through so the resize gesture doesn't also
		// register as a focus-only pointerdown on parent elements. Don't
		// preventDefault here — startDrag doesn't either, and `touch-action:
		// none` on the grip itself handles the touch-scroll case.
		this.focus(id);
		e.stopPropagation();

		const rect = el.getBoundingClientRect();
		const startW = rect.width;
		const startH = rect.height;
		const startX = e.clientX;
		const startY = e.clientY;
		const grip = e.currentTarget as HTMLElement;
		grip.setPointerCapture(e.pointerId);

		const onMove = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			// Upper bound is the *tighter* of two constraints, both of which
			// CSS will enforce at render time:
			//   - .window max-width / max-height: viewport - 2 × margin
			//   - right/bottom edge: viewport - rect.{left,top} - margin
			// Take min so the inline style we write never exceeds what CSS
			// will draw — otherwise the rendered box stops growing while the
			// cursor keeps moving and the grip decouples from the pointer.
			const widthMax = Math.min(
				window.innerWidth - 2 * VIEWPORT_MARGIN_X,
				window.innerWidth - rect.left - VIEWPORT_MARGIN_X,
			);
			const heightMax = Math.min(
				window.innerHeight - VIEWPORT_MARGIN_TOP - VIEWPORT_MARGIN_BOTTOM,
				window.innerHeight - rect.top - VIEWPORT_MARGIN_BOTTOM,
			);
			const w = clamp(startW + (ev.clientX - startX), WINDOW_MIN_W, widthMax);
			const h = clamp(startH + (ev.clientY - startY), WINDOW_MIN_H, heightMax);
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
		};

		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			if (grip.hasPointerCapture(e.pointerId)) {
				grip.releasePointerCapture(e.pointerId);
			}
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointercancel', onUp);
			this.savePosition(id, el);
		};

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp);
		document.addEventListener('pointercancel', onUp);
	}

	private savePosition(id: string, el: HTMLElement) {
		// Drag/resize only updates 'restored' geometry. While maximized, the
		// stored 'prior' rect is the unmaximize target — savePosition is a
		// no-op (we don't want a maximized window's full-screen rect to
		// overwrite the prior position). The drag handler doesn't fire on
		// maximized windows (startDrag bails early), so this is the
		// programmatic-write path only.
		const current = this.state.windows[id];
		if (current?.kind === 'maximized') return;
		this.state.windows[id] = { kind: 'restored', rect: rectOfElement(el) };
		this.persist();
	}

	private restorePosition(id: string, el: HTMLElement) {
		const ws = this.state.windows[id];
		if (ws) {
			// Apply the restored rect either way — maximized state still has a
			// prior rect so the underlying element keeps a sensible size when
			// the maximize class is later toggled off.
			const rect = ws.kind === 'restored' ? ws.rect : ws.prior;
			applyRect(el, rect);
			if (ws.kind === 'maximized') el.classList.add('window--maximized');
			return;
		}

		// Default position: cascade based on how many other windows are open.
		const i = this.state.open.length;
		el.style.left = `${120 + i * 28}px`;
		el.style.top = `${80 + i * 28}px`;
	}

	private persist() {
		saveState(this.state);
	}
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => new WindowManager());
	} else {
		new WindowManager();
	}
}

export {};
