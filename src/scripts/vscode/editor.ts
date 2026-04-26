/*
 * Editor pane: shiki-prerendered HTML when the path has a build-time
 * highlight, plain text otherwise. Line-number gutter is rendered
 * separately so it stays aligned regardless of which path is taken.
 *
 * Build-time highlighting lives in src/scripts/vscode/highlight-build.mjs;
 * shiki itself never reaches the runtime — only the resulting HTML strings
 * inlined via Vite define. Missing entries are expected (text files,
 * dynamic-content fixtures): they fall through to plain text.
 *
 * HTML insertion trust note: the shiki output is generated at build time
 * by `prerenderHighlights()` from files committed to this repo. There is
 * no runtime input path — Vite inlines the resulting object as a JS
 * literal at config-eval time. We use Range.createContextualFragment
 * rather than `innerHTML` to be explicit that we're parsing trusted HTML.
 */

import type { VfsNode } from './types';

const HIGHLIGHTS = import.meta.env.PUBLIC_VSCODE_HIGHLIGHTS;

export function renderEditor(container: HTMLElement, node: VfsNode | null): { line: number; col: number; language: string } {
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
	const prerendered = HIGHLIGHTS[node.path];
	if (prerendered) {
		// Trusted: build-time shiki output, no runtime user input. See module header.
		const fragment = document.createRange().createContextualFragment(prerendered);
		code.appendChild(fragment);
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
