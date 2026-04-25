/*
 * Build the vscode file tree from:
 *   - shared virtualFs (filtered to skip priv:true entries)
 *   - curated project/ subtree sourced from real repo files via ?raw
 */

import { virtualFs, type Entry } from '../../data/virtual-fs';
import type { VfsNode } from './types';

// Real-repo-file raw imports (Vite bakes these at build time)
import appsTsRaw from '../../data/apps.ts?raw';
import indexAstroRaw from '../../pages/index.astro?raw';
import resumeRaw from '../../../public/files/resume.md?raw';
import vscodeReadme from '../../data/vscode-readme.md?raw';

/** Slice to at most N lines for the project/src/ snippets. */
function first(raw: string, lines: number): string {
	return raw.split('\n').slice(0, lines).join('\n');
}

const SNIPPET_LINES = 40;

/**
 * Files shown under project/ — curated, distinct from home/ and etc/.
 *
 * Note: the production-URL literal baked inside `src/pages/index.astro` and
 * other snippet sources is scrubbed to `<site>` at build time by the
 * `scrubVscodeSnippets` Vite plugin in astro.config.mjs. That plugin keeps
 * `scripts/assert-no-url-leakage.sh` green — see the plugin comment there
 * for the rationale.
 */
const projectFiles: Record<string, { content: string; language: string }> = {
	'/project/README.md': { content: vscodeReadme, language: 'markdown' },
	'/project/resume.md': { content: resumeRaw, language: 'markdown' },
	'/project/src/data/apps.ts': {
		content: first(appsTsRaw, SNIPPET_LINES) + '\n/* ...snippet — see the real file on github... */\n',
		language: 'typescript',
	},
	'/project/src/pages/index.astro': {
		content: first(indexAstroRaw, SNIPPET_LINES) + '\n{/* ...snippet — see the real file on github... */}\n',
		language: 'astro',
	},
};

/** Add intermediate dir entries for a given file path. */
function addDirsFor(path: string, nodes: Map<string, VfsNode>): void {
	const parts = path.split('/').filter(Boolean);
	for (let i = 1; i < parts.length; i++) {
		const dirPath = '/' + parts.slice(0, i).join('/');
		if (!nodes.has(dirPath)) {
			nodes.set(dirPath, {
				path: dirPath,
				name: parts[i - 1],
				type: 'dir',
				children: [],
			});
		}
	}
}

/** Build the full tree as a path→node map. */
export function buildTree(): Map<string, VfsNode> {
	const nodes = new Map<string, VfsNode>();

	// 1. From virtualFs: everything under /home/ and /etc/, skip priv:true.
	for (const [path, entry] of Object.entries(virtualFs) as [string, Entry][]) {
		if (entry.type === 'file' && entry.priv) continue;
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) continue;           // skip root
		const name = parts[parts.length - 1];
		nodes.set(path, {
			path,
			name,
			type: entry.type,
			content: entry.type === 'file' ? entry.content : undefined,
			language: entry.type === 'file' ? entry.language : undefined,
			children: entry.type === 'dir' ? [] : undefined,
		});
		addDirsFor(path, nodes);
	}

	// 2. Curated project/ subtree from real-repo snippets.
	for (const [path, { content, language }] of Object.entries(projectFiles)) {
		const name = path.split('/').filter(Boolean).pop()!;
		nodes.set(path, { path, name, type: 'file', content, language });
		addDirsFor(path, nodes);
	}

	// 3. Wire children lists for every dir.
	for (const node of nodes.values()) {
		if (node.type !== 'dir') continue;
		node.children = [...nodes.keys()]
			.filter((p) => p.startsWith(node.path + '/'))
			.filter((p) => p.slice(node.path.length + 1).indexOf('/') === -1)  // immediate children only
			.sort((a, b) => {
				const aIsDir = nodes.get(a)?.type === 'dir';
				const bIsDir = nodes.get(b)?.type === 'dir';
				if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;                  // dirs first
				return a.localeCompare(b);
			});
	}

	// 4. Synthesize root.
	nodes.set('/', {
		path: '/',
		name: '',
		type: 'dir',
		children: [...nodes.keys()]
			.filter((p) => p !== '/' && p.lastIndexOf('/') === 0)
			.sort((a, b) => {
				const aIsDir = nodes.get(a)?.type === 'dir';
				const bIsDir = nodes.get(b)?.type === 'dir';
				if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
				return a.localeCompare(b);
			}),
	});

	return nodes;
}

/** Render the tree into a container element. Emits 'vscode:open-file' CustomEvent on file click. */
export function renderTree(container: HTMLElement, nodes: Map<string, VfsNode>, expanded: Set<string>): void {
	const root = nodes.get('/')!;
	container.replaceChildren(renderChildren(root, nodes, expanded));
}

/** Attach click delegation to the tree container. Idempotent: safe to call once. */
export function attachTree(
	container: HTMLElement,
	nodes: Map<string, VfsNode>,
	expanded: Set<string>,
	onChange: () => void,
): void {
	container.addEventListener('click', (ev) => {
		const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-path]');
		if (!el) return;
		const path = el.dataset.path!;
		const node = nodes.get(path);
		if (!node) return;
		if (node.type === 'dir') {
			if (expanded.has(path)) expanded.delete(path);
			else expanded.add(path);
			onChange();
		} else {
			container.dispatchEvent(new CustomEvent('vscode:open-file', { detail: { path }, bubbles: true }));
		}
	});
}

function renderChildren(parent: VfsNode, nodes: Map<string, VfsNode>, expanded: Set<string>): HTMLElement {
	const ul = document.createElement('ul');
	ul.className = 'vscode-tree-list';
	for (const childPath of parent.children ?? []) {
		const node = nodes.get(childPath);
		if (!node) continue;
		const li = document.createElement('li');
		li.className = `vscode-tree-item ${node.type}`;
		const row = document.createElement('div');
		row.className = 'vscode-tree-row';
		row.dataset.path = node.path;
		const indicator = node.type === 'dir' ? (expanded.has(node.path) ? '▾' : '▸') : ' ';
		row.textContent = `${indicator} ${node.name}${node.type === 'dir' ? '/' : ''}`;
		li.appendChild(row);
		if (node.type === 'dir' && expanded.has(node.path)) {
			li.appendChild(renderChildren(node, nodes, expanded));
		}
		ul.appendChild(li);
	}
	return ul;
}
