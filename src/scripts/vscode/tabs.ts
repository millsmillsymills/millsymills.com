/*
 * Tab strip rendering + interaction.
 */

import type { VfsNode, TabState } from './types';

export function renderTabs(
	container: HTMLElement,
	nodes: Map<string, VfsNode>,
	state: TabState,
): void {
	const frag = document.createDocumentFragment();
	for (const path of state.openTabs) {
		const node = nodes.get(path);
		if (!node) continue;
		const tab = document.createElement('div');
		tab.className = `vscode-tab${path === state.activeTab ? ' active' : ''}`;
		tab.dataset.path = path;

		const label = document.createElement('span');
		label.className = 'vscode-tab-label';
		label.textContent = node.name;
		tab.appendChild(label);

		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'vscode-tab-close';
		close.textContent = '×';
		close.setAttribute('aria-label', `close ${node.name}`);
		close.dataset.close = path;
		tab.appendChild(close);

		frag.appendChild(tab);
	}
	container.replaceChildren(frag);
}

/** Attach one-time delegation to a tab bar. Emits CustomEvents: vscode:switch-tab, vscode:close-tab. */
export function attachTabBar(container: HTMLElement): void {
	container.addEventListener('click', (ev) => {
		const target = ev.target as HTMLElement;
		const closeBtn = target.closest<HTMLElement>('[data-close]');
		if (closeBtn) {
			ev.stopPropagation();
			container.dispatchEvent(
				new CustomEvent('vscode:close-tab', { detail: { path: closeBtn.dataset.close }, bubbles: true }),
			);
			return;
		}
		const tab = target.closest<HTMLElement>('.vscode-tab');
		if (tab) {
			container.dispatchEvent(
				new CustomEvent('vscode:switch-tab', { detail: { path: tab.dataset.path }, bubbles: true }),
			);
		}
	});
}
