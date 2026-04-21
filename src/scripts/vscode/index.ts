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
