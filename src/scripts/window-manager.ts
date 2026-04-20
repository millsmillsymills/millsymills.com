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

function loadState(): DesktopState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { open: [], windows: {} };
		const parsed = JSON.parse(raw) as DesktopState;
		if (!parsed || typeof parsed !== 'object') return { open: [], windows: {} };
		return {
			open: Array.isArray(parsed.open) ? parsed.open : [],
			windows: parsed.windows && typeof parsed.windows === 'object' ? parsed.windows : {},
		};
	} catch {
		return { open: [], windows: {} };
	}
}

function saveState(state: DesktopState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		/* localStorage might be disabled — silently ignore */
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
		// positions and z-order.
		const open = [...this.state.open];
		this.state.open = [];
		open.forEach((id) => this.open(id, { skipPosition: false }));
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
			const x = clamp(ev.clientX - offsetX, 0, window.innerWidth - 80);
			const y = clamp(ev.clientY - offsetY, 0, window.innerHeight - 60);
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;
		};

		const onUp = () => {
			titlebar.releasePointerCapture(e.pointerId);
			titlebar.removeEventListener('pointermove', onMove);
			titlebar.removeEventListener('pointerup', onUp);
			titlebar.removeEventListener('pointercancel', onUp);
			this.savePosition(id, el);
		};

		titlebar.addEventListener('pointermove', onMove);
		titlebar.addEventListener('pointerup', onUp);
		titlebar.addEventListener('pointercancel', onUp);
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
