/*
 * Build the vscode file tree from:
 *   - shared virtualFs (filtered to skip priv:true entries)
 *   - curated project/ subtree sourced from real repo files via ?raw
 */

import { virtualFs, type Entry } from '../../data/virtual-fs';
import type { VfsNode, VfsDirNode } from './types';
import { PROJECT_SNIPPETS, applySnippet } from './snippet-manifest.mjs';

// Real-repo-file raw imports. Vite requires literal specifiers, so we can't
// drive these from the manifest at the import site. Instead, the bidirectional
// check below ensures every literal `?raw` import path is registered in the
// manifest (and vice versa) — a new import that forgot to register, or a
// manifest entry whose import was removed, fires at module load.
import vscodeReadmeRaw from '../../data/vscode-readme.md?raw';
import resumeRaw from '../../../public/files/resume.md?raw';
import appsTsRaw from '../../data/apps.ts?raw';
import indexAstroRaw from '../../pages/index.astro?raw';

/** Mirror of the literal `?raw` imports above, keyed by manifest's `rawImportPath`. */
const RAW_BY_PATH: Record<string, string> = {
	'/src/data/vscode-readme.md': vscodeReadmeRaw,
	'/src/data/apps.ts': appsTsRaw,
	'/src/pages/index.astro': indexAstroRaw,
	'/public/files/resume.md': resumeRaw,
};

{
	const importedPaths = Object.keys(RAW_BY_PATH).sort();
	const manifestPaths = PROJECT_SNIPPETS.map((s) => s.rawImportPath).sort();
	const missingFromManifest = importedPaths.filter((p) => !manifestPaths.includes(p));
	const missingFromImports = manifestPaths.filter((p) => !importedPaths.includes(p));
	if (missingFromManifest.length || missingFromImports.length) {
		throw new Error(
			'vscode/file-tree.ts: literal ?raw imports and snippet-manifest.mjs disagree.\n' +
				`  imports not in manifest:  ${missingFromManifest.join(', ') || '(none)'}\n` +
				`  manifest not in imports:  ${missingFromImports.join(', ') || '(none)'}\n` +
				'Update src/scripts/vscode/snippet-manifest.mjs and the literal ?raw imports here so they agree.',
		);
	}
}

/**
 * Files shown under project/ — derived from the shared manifest so that
 * the byte content matches what highlight-build.mjs prerenders for the
 * same path. Production-URL scrubbing applies here for the same reason
 * astro.config.mjs's scrubVscodeSnippets plugin scrubs at build time:
 * `assert-no-url-leakage.sh` rejects literal hardcodes in dist/.
 */
const projectFiles: Record<string, { content: string; language: string }> = Object.fromEntries(
	PROJECT_SNIPPETS.map((entry) => {
		const raw = RAW_BY_PATH[entry.rawImportPath];
		// Defensive: the drift assertion above already throws on this case,
		// but if the assertion is ever moved or refactored away, we want a
		// targeted error pointing at the manifest rather than a cryptic
		// `undefined.split is not a function` from inside applySnippet.
		if (raw === undefined) {
			throw new Error(`vscode/file-tree.ts: no ?raw import registered for manifest entry ${entry.rawImportPath}`);
		}
		return [entry.vscodePath, { content: applySnippet(raw, entry), language: entry.language }];
	}),
);

/** Add intermediate dir entries for a given file path. */
function addDirsFor(path: string, nodes: Map<string, VfsNode>): void {
	const parts = path.split('/').filter(Boolean);
	for (let i = 1; i < parts.length; i++) {
		const dirPath = '/' + parts.slice(0, i).join('/');
		if (!nodes.has(dirPath)) {
			nodes.set(dirPath, {
				type: 'dir',
				path: dirPath,
				name: parts[i - 1],
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
		if (entry.type === 'file') {
			nodes.set(path, { type: 'file', path, name, content: entry.content, language: entry.language });
		} else {
			nodes.set(path, { type: 'dir', path, name, children: [] });
		}
		addDirsFor(path, nodes);
	}

	// 2. Curated project/ subtree from real-repo snippets.
	for (const [path, { content, language }] of Object.entries(projectFiles)) {
		const name = path.split('/').filter(Boolean).pop()!;
		nodes.set(path, { type: 'file', path, name, content, language });
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
		type: 'dir',
		path: '/',
		name: '',
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
	const root = nodes.get('/');
	if (!root || root.type !== 'dir') return;
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

function renderChildren(parent: VfsDirNode, nodes: Map<string, VfsNode>, expanded: Set<string>): HTMLElement {
	const ul = document.createElement('ul');
	ul.className = 'vscode-tree-list';
	for (const childPath of parent.children) {
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
