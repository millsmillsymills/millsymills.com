/*
 * Command palette — Cmd-K / Ctrl-K opens a filterable list of apps
 * (plus a few site-wide actions). Keyboard-first: Esc closes, arrow
 * keys navigate, Enter activates.
 *
 * Opens the matching window on desktop, switches app on mobile shell,
 * navigates to /<app>/ when nothing on the current page matches.
 *
 * Easter egg: typing a specific query reveals an extra result that
 * captures the `palette` flag directly.
 */

import { apps } from '../data/apps';
import { captureById, flagsUnlocked } from './flags';
import { escapeHtml } from './util/html';

const SECRET_QUERIES = ['hack', 'hackers', 'hack the planet', 'mills'];

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

	constructor(root: HTMLElement) {
		this.overlay = root;
		this.input = root.querySelector<HTMLInputElement>('.cmdp__input')!;
		this.list = root.querySelector<HTMLUListElement>('.cmdp__list')!;
		this.entries = this.buildEntries();

		this.bindGlobalKeys();
		this.bindInput();
		this.bindList();

		// Re-build entries on first capture so the flags app appears live
		// without a reload. Subsequent captures don't change visibility.
		window.addEventListener('mills:flags-unlocked', () => {
			this.entries = this.buildEntries();
			if (!this.overlay.hidden) this.render();
		});
	}

	private buildEntries(): Entry[] {
		const unlocked = flagsUnlocked();
		// Hidden apps (mail, vscode, flags) stay out of the palette by
		// default — same advertising-surface rule as the launcher and
		// start menu. Flags is the special case: once the player has
		// captured a flag, reveal it as a reward, even though it's
		// flagged `hidden` for first-impression hygiene.
		return apps
			.filter((a) => (a.id === 'flags' ? unlocked : !a.hidden))
			.map<Entry>((a) => ({
				id: a.id,
				label: a.title,
				hint: `open ${a.id}`,
				glyph: a.glyph,
				run: () => this.openApp(a.id),
			}));
	}

	private secretEntry(): Entry {
		return {
			id: 'palette-secret',
			label: 'reveal hidden flag',
			hint: 'you asked nicely',
			glyph: '🪄',
			run: () => {
				captureById('palette');
				this.input.value = 'flag{command_k_to_rule_them_all}';
				this.render();
			},
		};
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
			}
		});
	}

	private bindList(): void {
		this.list.addEventListener('click', (e) => {
			const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cmdp-idx]');
			if (!target) return;
			const idx = Number(target.dataset.cmdpIdx);
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
		this.overlay.hidden = false;
		this.input.value = '';
		this.activeIdx = 0;
		this.render();
		requestAnimationFrame(() => this.input.focus());
	}

	private close(): void {
		this.overlay.hidden = true;
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
		const keepOpen = entry.id === 'palette-secret';
		try {
			entry.run();
		} finally {
			if (!keepOpen) this.close();
		}
	}

	private render(): void {
		const q = this.input.value.trim().toLowerCase();
		let entries = this.entries.filter(
			(e) =>
				!q ||
				e.id.toLowerCase().includes(q) ||
				e.label.toLowerCase().includes(q) ||
				e.hint.toLowerCase().includes(q),
		);
		// Secret entry only surfaces post-unlock — pre-capture it would
		// reveal there's a CTF surface to find, defeating the gate.
		if (flagsUnlocked() && SECRET_QUERIES.includes(q)) entries = [this.secretEntry(), ...entries];
		this.visibleEntries = entries;
		this.activeIdx = Math.min(this.activeIdx, entries.length - 1);
		if (this.activeIdx < 0) this.activeIdx = 0;

		this.list.innerHTML = '';
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
			li.dataset.cmdpIdx = String(i);
			// Glyphs are emoji today and authored in apps.ts, but escape anyway —
			// a future contributor adding `<` would land XSS via this innerHTML.
			li.innerHTML = `
				<span class="cmdp__glyph" aria-hidden="true">${escapeHtml(e.glyph)}</span>
				<span class="cmdp__label">${escapeHtml(e.label)}</span>
				<span class="cmdp__hint">${escapeHtml(e.hint)}</span>
			`;
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
