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

const STORAGE_KEY = 'mills.desktop.v1';
const Z_BASE = 100;

type WindowState = {
	x: number;
	y: number;
	w: number;
	h: number;
	maximized: boolean;
};

type DesktopState = {
	open: string[]; // currently-open window ids in z-order (last = top)
	windows: Record<string, WindowState>;
};

function isValidWindowState(v: unknown): v is WindowState {
	if (!v || typeof v !== 'object') return false;
	const s = v as Record<string, unknown>;
	return (
		typeof s.x === 'number' && Number.isFinite(s.x) &&
		typeof s.y === 'number' && Number.isFinite(s.y) &&
		typeof s.w === 'number' && Number.isFinite(s.w) &&
		typeof s.h === 'number' && Number.isFinite(s.h) &&
		typeof s.maximized === 'boolean'
	);
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

	// Validate each WindowState. Drop entries with non-finite numerics so a
	// corrupted x/y/w/h doesn't flow to clamp(NaN, ...) and render at the
	// browser's default position with no error. Loud breadcrumb on drops.
	const windows: Record<string, WindowState> = {};
	if (p.windows && typeof p.windows === 'object') {
		for (const [id, val] of Object.entries(p.windows as Record<string, unknown>)) {
			if (isValidWindowState(val)) {
				windows[id] = val;
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

			el.addEventListener('pointerdown', () => this.focus(id));

			el.querySelector<HTMLButtonElement>('.window-control--close')?.addEventListener(
				'click',
				(e) => {
					e.stopPropagation();
					this.close(id);
				},
			);

			el.querySelector<HTMLButtonElement>('.window-control--min')?.addEventListener(
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
	// .hidden directly leaves stale entries; #51.
	private bindExternalCloseEvent() {
		document.addEventListener('mills:close-window', (ev) => {
			const id = (ev as CustomEvent<{ id?: string }>).detail?.id;
			if (typeof id === 'string') this.close(id);
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
		const open = [...this.state.open];
		this.state.open = [];
		open.forEach((id) => this.open(id, { skipPosition: false }));

		try {
			const params = new URLSearchParams(window.location.search);
			const requested = params.get('open');
			if (requested) {
				requested
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
					.forEach((id) => this.open(id));
			}
		} catch (err) {
			console.warn('[mills.desktop] failed to read ?open= query param', err);
		}

		const bodyInitial = document.body?.dataset.initialOpen;
		if (bodyInitial) this.open(bodyInitial);
	}

	// ----------------------------------------------------------------
	// behaviors

	private open(id: string, opts: { skipPosition?: boolean } = {}) {
		const el = this.windows.get(id);
		if (!el) return;

		el.hidden = false;
		if (!opts.skipPosition) this.restorePosition(id, el);

		// Move id to the top of the open list.
		this.state.open = this.state.open.filter((x) => x !== id);
		this.state.open.push(id);

		this.applyZ();
		this.renderTaskbar();
		this.persist();
	}

	private close(id: string) {
		const el = this.windows.get(id);
		if (!el) return;
		el.hidden = true;
		this.state.open = this.state.open.filter((x) => x !== id);
		this.renderTaskbar();
		this.persist();
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
		el.classList.toggle('window--maximized');
		const ws = this.state.windows[id];
		if (ws) ws.maximized = el.classList.contains('window--maximized');
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

	private savePosition(id: string, el: HTMLElement) {
		const rect = el.getBoundingClientRect();
		this.state.windows[id] = {
			x: rect.left,
			y: rect.top,
			w: rect.width,
			h: rect.height,
			maximized: el.classList.contains('window--maximized'),
		};
		this.persist();
	}

	private restorePosition(id: string, el: HTMLElement) {
		const ws = this.state.windows[id];
		if (ws) {
			el.style.left = `${clamp(ws.x, 0, window.innerWidth - 80)}px`;
			el.style.top = `${clamp(ws.y, 0, window.innerHeight - 60)}px`;
			if (ws.w) el.style.width = `${ws.w}px`;
			if (ws.h) el.style.height = `${ws.h}px`;
			if (ws.maximized) el.classList.add('window--maximized');
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
