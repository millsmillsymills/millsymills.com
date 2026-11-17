/*
 * Build-time Shiki tokens are rendered with element/text APIs only. No HTML
 * parser or TrustedHTML policy is needed under enforcing Trusted Types.
 * Missing highlights use plain text; Shiki itself stays out of the bundle.
 */

import type { VfsNode } from './types';

export function renderEditor(container: HTMLElement, node: VfsNode | null, highlights = import.meta.env.PUBLIC_VSCODE_HIGHLIGHTS): { line: number; col: number; language: string } {
	if (!node || node.type !== 'file') {
		const empty = document.createElement('div');
		empty.className = 'vscode-editor-empty';
		empty.textContent = 'no file open';
		container.replaceChildren(empty);
		return { line: 1, col: 1, language: 'plain text' };
	}

	const content = node.content;
	const lineCount = content.split('\n').length;

	const gutter = document.createElement('pre');
	gutter.className = 'vscode-editor-gutter';
	gutter.textContent = Array.from({ length: lineCount }, (_, i) => String(i + 1).padStart(4, ' ')).join('\n');

	const code = document.createElement('div');
	code.className = 'vscode-editor-code';
	const prerendered = highlights[node.path];
	if (prerendered) {
		const pre = document.createElement('pre');
		pre.className = 'shiki neon-noir';
		const body = document.createElement('code');
		for (const [index, tokens] of prerendered.entries()) {
			if (index > 0) body.append(document.createTextNode('\n'));
			const line = document.createElement('span');
			line.className = 'line';
			for (const token of tokens) {
				const span = document.createElement('span');
				span.textContent = token.content;
				if (token.color) span.style.color = token.color;
				if ((token.fontStyle ?? 0) & 1) span.style.fontStyle = 'italic';
				if ((token.fontStyle ?? 0) & 2) span.style.fontWeight = 'bold';
				if ((token.fontStyle ?? 0) & 4) span.style.textDecoration = 'underline';
				line.appendChild(span);
			}
			body.appendChild(line);
		}
		pre.appendChild(body);
		code.appendChild(pre);
	} else {
		const pre = document.createElement('pre');
		pre.className = 'vscode-editor-plain';
		pre.textContent = content;
		code.appendChild(pre);
	}

	container.replaceChildren(gutter, code);

	return {
		line: 1,
		col: 1,
		language: node.language ?? 'plain text',
	};
}
