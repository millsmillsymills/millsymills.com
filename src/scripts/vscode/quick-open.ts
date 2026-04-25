/*
 * Quick-open palette (Cmd-P / Ctrl-P) for vscode.exe.
 *
 * Scoped to the vscode window — the global Cmd-K palette is unaffected
 * because we gate on focus (the topmost open .window) before claiming
 * the keypress.
 *
 * Source: every file node in the rendered tree (already filtered to skip
 * priv:true entries by file-tree.ts). Match: case-insensitive substring on
 * basename, then on full path. No new dep — the entry count is small (<50).
 */

import type { VfsNode } from './types';

const MAX_RESULTS = 50;

export interface QuickOpenOptions {
	root: HTMLElement;
	nodes: Map<string, VfsNode>;
	onOpen: (path: string) => void;
	/** Returns true iff the vscode window is the focused (topmost) window. */
	isFocused: () => boolean;
}

interface Hit {
	node: VfsNode;
	score: number;
}

function scoreHit(query: string, node: VfsNode): number {
	if (!query) return 1; // surface everything when the box is empty
	const q = query.toLowerCase();
	const name = node.name.toLowerCase();
	const path = node.path.toLowerCase();
	const nameIdx = name.indexOf(q);
	if (nameIdx === 0) return 1000 - name.length;       // basename prefix
	if (nameIdx > 0) return 500 - nameIdx;              // basename substring
	const pathIdx = path.indexOf(q);
	if (pathIdx >= 0) return 100 - pathIdx;             // anywhere in path
	return 0;
}

export function attachQuickOpen(opts: QuickOpenOptions): void {
	const { root, nodes, onOpen, isFocused } = opts;
	const overlayEl = root.querySelector<HTMLElement>('.vscode-qopen');
	const inputEl = root.querySelector<HTMLInputElement>('.vscode-qopen__input');
	const listEl = root.querySelector<HTMLUListElement>('.vscode-qopen__list');
	if (!overlayEl || !inputEl || !listEl) {
		console.warn('[vscode/quick-open] missing markup — bail');
		return;
	}
	const overlay = overlayEl;
	const input = inputEl;
	const list = listEl;

	const files: VfsNode[] = [];
	for (const node of nodes.values()) if (node.type === 'file') files.push(node);

	let visible: VfsNode[] = [];
	let activeIdx = 0;

	function open(): void {
		overlay.hidden = false;
		input.value = '';
		activeIdx = 0;
		render();
		requestAnimationFrame(() => input.focus());
	}

	function close(): void {
		overlay.hidden = true;
	}

	function render(): void {
		const q = input.value.trim();
		const hits: Hit[] = [];
		for (const node of files) {
			const score = scoreHit(q, node);
			if (score > 0) hits.push({ node, score });
		}
		hits.sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path));
		visible = hits.slice(0, MAX_RESULTS).map((h) => h.node);
		if (activeIdx >= visible.length) activeIdx = Math.max(0, visible.length - 1);
		paint();
	}

	function paint(): void {
		list.replaceChildren();
		if (!visible.length) {
			const li = document.createElement('li');
			li.className = 'vscode-qopen__empty';
			li.textContent = 'no matches';
			list.appendChild(li);
			return;
		}
		visible.forEach((node, i) => {
			const li = document.createElement('li');
			li.className = 'vscode-qopen__item' + (i === activeIdx ? ' vscode-qopen__item--active' : '');
			li.dataset.idx = String(i);
			const name = document.createElement('span');
			name.className = 'vscode-qopen__name';
			name.textContent = node.name;
			const dir = document.createElement('span');
			dir.className = 'vscode-qopen__dir';
			dir.textContent = node.path.slice(0, node.path.length - node.name.length);
			li.append(name, dir);
			list.appendChild(li);
		});
	}

	function move(delta: number): void {
		if (!visible.length) return;
		activeIdx = (activeIdx + delta + visible.length) % visible.length;
		paint();
		const el = list.querySelector<HTMLElement>('.vscode-qopen__item--active');
		if (el) el.scrollIntoView({ block: 'nearest' });
	}

	function activate(): void {
		const node = visible[activeIdx];
		if (!node) return;
		close();
		onOpen(node.path);
	}

	// Focus-gated global keybinding. We only claim Cmd-P / Ctrl-P when the
	// vscode window is on top AND this particular root is the visible mount
	// (vscode.exe is rendered twice — once for the desktop shell, once for
	// the mobile shell — only one is on-screen at a time, the other has
	// `display: none` somewhere up its ancestor chain so `offsetParent` is
	// null). Otherwise the browser keeps its default (print dialog).
	function isActiveMount(): boolean {
		return isFocused() && root.offsetParent !== null;
	}
	window.addEventListener('keydown', (e) => {
		if ((e.key === 'p' || e.key === 'P') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
			if (!isActiveMount()) return;
			e.preventDefault();
			if (overlay.hidden) open();
			else close();
			return;
		}
		if (!overlay.hidden && e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	});

	input.addEventListener('input', render);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			activate();
		}
	});

	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) {
			close();
			return;
		}
		const item = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
		if (!item) return;
		const idx = Number(item.dataset.idx);
		if (Number.isNaN(idx)) return;
		activeIdx = idx;
		activate();
	});
}
