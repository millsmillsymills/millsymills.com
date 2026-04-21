/*
 * vscode.exe entry — wires tree, tabs, editor, and state together.
 *
 * Exposes `initVscode(root: HTMLElement)` which the Astro component calls
 * on DOMContentLoaded.
 */

import { buildTree, renderTree, attachTree } from './file-tree';
import { renderTabs, attachTabBar } from './tabs';
import { renderEditor } from './editor';
import { loadState, saveState, addTab, closeTab, switchTab } from './state';

export function initVscode(root: HTMLElement): void {
	const sidebar = root.querySelector<HTMLElement>('.vscode-sidebar-tree');
	const tabBar = root.querySelector<HTMLElement>('.vscode-tabs');
	const editor = root.querySelector<HTMLElement>('.vscode-editor');
	const statusLang = root.querySelector<HTMLElement>('[data-status="lang"]');
	const statusLine = root.querySelector<HTMLElement>('[data-status="line"]');
	if (!sidebar || !tabBar || !editor) {
		console.warn('[vscode] missing mount points — bail');
		return;
	}

	const nodes = buildTree();
	let state = loadState();
	// Scrub stale paths: the tree can change between sessions (dotfiles
	// added/removed), so any persisted openTab that no longer exists in the
	// current tree is dropped. Same for activeTab — null it if gone.
	const prevOpenCount = state.openTabs.length;
	const openTabs = state.openTabs.filter((p) => nodes.has(p));
	const activeTab = state.activeTab && nodes.has(state.activeTab) ? state.activeTab : (openTabs[openTabs.length - 1] ?? null);
	if (openTabs.length !== prevOpenCount) {
		console.warn(`[vscode] dropped ${prevOpenCount - openTabs.length} stale tab path(s) missing from current tree`);
	}
	state = { ...state, openTabs, activeTab };

	const expanded = new Set<string>(['/project', '/home', '/home/mills', '/etc']);

	function refreshAll() {
		renderTree(sidebar!, nodes, expanded);
		renderTabs(tabBar!, nodes, state);
		const activeNode = state.activeTab ? nodes.get(state.activeTab) ?? null : null;
		const status = renderEditor(editor!, activeNode);
		if (statusLang) statusLang.textContent = status.language;
		if (statusLine) statusLine.textContent = `Ln ${status.line}, Col ${status.col}`;
		saveState(state);
	}

	attachTree(sidebar, nodes, expanded, refreshAll);
	sidebar.addEventListener('vscode:open-file', ((ev: CustomEvent<{ path: string }>) => {
		state = addTab(state, ev.detail.path);
		refreshAll();
	}) as EventListener);

	attachTabBar(tabBar);
	tabBar.addEventListener('vscode:switch-tab', ((ev: CustomEvent<{ path: string }>) => {
		state = switchTab(state, ev.detail.path);
		refreshAll();
	}) as EventListener);
	tabBar.addEventListener('vscode:close-tab', ((ev: CustomEvent<{ path: string }>) => {
		state = closeTab(state, ev.detail.path);
		refreshAll();
	}) as EventListener);

	refreshAll();
}
