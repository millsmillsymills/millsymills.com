/*
 * Plain-text renderer with line-number gutter.
 */

import type { VfsNode } from './types';

export function renderEditor(container: HTMLElement, node: VfsNode | null): { line: number; col: number; language: string } {
	if (!node || node.type !== 'file') {
		const empty = document.createElement('div');
		empty.className = 'vscode-editor-empty';
		empty.textContent = 'no file open';
		container.replaceChildren(empty);
		return { line: 1, col: 1, language: 'plain text' };
	}

	const content = node.content;
	const lines = content.split('\n');

	const gutter = document.createElement('pre');
	gutter.className = 'vscode-editor-gutter';
	gutter.textContent = lines.map((_, i) => String(i + 1).padStart(4, ' ')).join('\n');

	const code = document.createElement('pre');
	code.className = 'vscode-editor-code';
	code.textContent = content;

	container.replaceChildren(gutter, code);

	return {
		line: 1,
		col: 1,
		language: node.language ?? 'plain text',
	};
}
