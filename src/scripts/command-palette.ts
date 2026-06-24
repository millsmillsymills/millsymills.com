/*
 * Command palette — Cmd-K / Ctrl-K opens a filterable list of apps
 * (plus a few site-wide actions). Keyboard-first: Esc closes, arrow
 * keys navigate, Enter activates.
 *
 * Opens the matching window on desktop, switches app on mobile shell,
 * navigates to /<app>/ when nothing on the current page matches.
 */

import { apps } from '../data/apps';

interface Entry {
	id: string;
	label: string;
	hint: string;
	glyph: string;
	run: () => void;
}

class CommandPalette {
	private overlay: HTMLElement;
	private input: HTMLInputElement;
	private list: HTMLUListElement;
	private entries: Entry[] = [];
	private visibleEntries: Entry[] = [];
	private activeIdx = 0;
	private prevFocus: HTMLElement | null = null;

	constructor(root: HTMLElement) {
		this.overlay = root;
		this.input = root.querySelector<HTMLInputElement>('.cmdp__input')!;
		this.list = root.querySelector<HTMLUListElement>('.cmdp__list')!;
		this.entries = this.buildEntries();

		this.bindGlobalKeys();
		this.bindInput();
		this.bindList();
	}

	private buildEntries(): Entry[] {
		// Hidden apps (mail, vscode) stay out of the palette — same
		// advertising-surface rule as the launcher and start menu.
		return apps
			.filter((a) => !a.hidden)
			.map<Entry>((a) => ({
				id: a.id,
				label: a.title,
				hint: `open ${a.id}`,
				glyph: a.glyph,
				run: () => this.openApp(a.id),
			}));
	}

	private bindGlobalKeys(): void {
		window.addEventListener('keydown', (e) => {
			if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				this.toggle();
				return;
			}
			if (!this.overlay.hidden && e.key === 'Escape') {
				e.preventDefault();
				this.close();
			}
		});
		this.overlay.addEventListener('click', (e) => {
			if (e.target === this.overlay) this.close();
		});
	}

	private bindInput(): void {
		this.input.addEventListener('input', () => this.render());
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				this.move(1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				this.move(-1);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				this.activate();
			} else if (e.key === 'Tab') {
				// The input is the dialog's only focusable control; trap Tab so
				// focus can't escape the aria-modal palette to the page behind.
				e.preventDefault();
				this.input.focus();
			}
		});
	}

	private bindList(): void {
		this.list.addEventListener('click', (e) => {
			const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cmdp-idx]');
			if (!target) return;
			const idx = Number(target.dataset['cmdpIdx']);
			if (Number.isNaN(idx)) return;
			this.activeIdx = idx;
			this.activate();
		});
	}

	private toggle(): void {
		if (this.overlay.hidden) this.open();
		else this.close();
	}

	private open(): void {
		this.prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		this.overlay.hidden = false;
		this.input.value = '';
		this.activeIdx = 0;
		this.render();
		requestAnimationFrame(() => this.input.focus());
	}

	private close(): void {
		this.overlay.hidden = true;
		const restore = this.prevFocus;
		this.prevFocus = null;
		if (restore && document.contains(restore)) restore.focus();
	}

	private move(delta: number): void {
		if (!this.visibleEntries.length) return;
		this.activeIdx =
			(this.activeIdx + delta + this.visibleEntries.length) % this.visibleEntries.length;
		this.renderActiveOnly();
	}

	private activate(): void {
		const entry = this.visibleEntries[this.activeIdx];
		if (!entry) return;
		try {
			entry.run();
		} finally {
			this.close();
		}
	}

	private render(): void {
		const q = this.input.value.trim().toLowerCase();
		const entries = this.entries.filter(
			(e) =>
				!q ||
				e.id.toLowerCase().includes(q) ||
				e.label.toLowerCase().includes(q) ||
				e.hint.toLowerCase().includes(q),
		);
		this.visibleEntries = entries;
		this.activeIdx = Math.min(this.activeIdx, entries.length - 1);
		if (this.activeIdx < 0) this.activeIdx = 0;

		this.list.replaceChildren();
		if (!entries.length) {
			const li = document.createElement('li');
			li.className = 'cmdp__empty';
			li.textContent = 'no matches';
			this.list.appendChild(li);
			return;
		}
		entries.forEach((e, i) => {
			const li = document.createElement('li');
			li.className = 'cmdp__item' + (i === this.activeIdx ? ' cmdp__item--active' : '');
			li.dataset['cmdpIdx'] = String(i);
			const glyph = document.createElement('span');
			glyph.className = 'cmdp__glyph';
			glyph.setAttribute('aria-hidden', 'true');
			glyph.textContent = e.glyph;
			const label = document.createElement('span');
			label.className = 'cmdp__label';
			label.textContent = e.label;
			const hint = document.createElement('span');
			hint.className = 'cmdp__hint';
			hint.textContent = e.hint;
			li.append(glyph, label, hint);
			this.list.appendChild(li);
		});
	}

	private renderActiveOnly(): void {
		this.list.querySelectorAll<HTMLElement>('.cmdp__item').forEach((el, i) => {
			el.classList.toggle('cmdp__item--active', i === this.activeIdx);
			if (i === this.activeIdx) el.scrollIntoView({ block: 'nearest' });
		});
	}

	private openApp(id: string): void {
		const opener = document.querySelector<HTMLElement>(`[data-open-window="${id}"]`);
		if (opener) {
			opener.click();
			return;
		}
		const mbtn = document.querySelector<HTMLElement>(`[data-open-app="${id}"]`);
		if (mbtn) {
			mbtn.click();
			return;
		}
		window.location.href = `/${id}/`;
	}
}

function init(): void {
	const root = document.querySelector<HTMLElement>('.cmdp');
	if (!root) return;
	new CommandPalette(root);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
