# Phase 5c — PR 6: vscode.exe desktop app (#45) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `vscode.exe` — an evocative Y2K-pink VS Code lookalike that opens inside a draggable window. File explorer sidebar + tabs + plain-text editor + status bar with commit SHA. Renders a curated file tree sourced from the shared `virtualFs` plus snippets of real repo files.

**Architecture:** One Astro component (shell + scoped styles) + a small client-side TS module split into responsibilities (state, file-tree, tabs, editor). Reads the shared `virtualFs` from PR 1. Persists open-tabs + active-tab in `localStorage['mills.vscode.v1']`. Real-repo-file snippets bake at build time via Vite `?raw` imports → slice to first 40 lines.

**Tech Stack:** Astro 6, TypeScript, CSS, DOM APIs. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md` — section *#45 — `vscode.exe` app*.
**Issue:** [#45](https://github.com/millsmillsymills/millsymills.com/issues/45)
**Branch:** `phase-5c/45-vscode`, cut from `main` after PR 2 merges.
**Depends on:** PR 1 (shared virtual-fs + PUBLIC_GIT_SHA) **and** PR 2 (dotfiles in virtual-fs) merged. The dotfile entries populate most of the vscode tree.
**Depends on input:** A — same as PR 2 (via virtual-fs). No new input beyond what PR 2 already landed.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/scripts/vscode/types.ts` | create | Shared types (`VfsNode`, `TabState`, etc.) |
| `src/scripts/vscode/state.ts` | create | localStorage persistence for tabs + active tab |
| `src/scripts/vscode/file-tree.ts` | create | Build the tree from `virtualFs` + real-file snippets; render to DOM |
| `src/scripts/vscode/tabs.ts` | create | Tab strip render + click/close/switch |
| `src/scripts/vscode/editor.ts` | create | Plain-text renderer with line-number gutter |
| `src/scripts/vscode/index.ts` | create | Entry: wire state + tree + tabs + editor together |
| `src/components/desktop/apps/VSCode.astro` | create | Shell markup (activity bar, sidebar slot, tab slot, editor slot, status bar) + import module |
| `src/styles/vscode.css` | create | All scoped vscode styles |
| `src/data/vscode-readme.md` | create | Teaser file rendered at `project/README.md` |
| `src/data/apps.ts` | modify | Add `vscode` entry |
| `src/components/desktop/Desktop.astro` | modify | Wire component (per existing pattern) |
| `src/components/desktop/MobileFallback.astro` | modify | Same |
| `src/data/privacy-copy.ts` | modify | Add `mills.vscode.v1` to the localStorage keys list |
| `src/env.d.ts` | modify | Add `*?raw` module declaration if PR 5 hasn't added it |

No new tests; repo convention is smoke. All DOM clearing uses `replaceChildren()` (no `innerHTML`, no XSS surface).

---

## Tree content plan

Final vscode file tree (desktop-only structure; mobile uses a flat list built from the same source). The `project/` subtree sources from real files via Vite `?raw` + slice. Everything under `home/` and `etc/` comes from `virtualFs` filtered to skip `priv: true`.

```
project/
  README.md                      (NEW: src/data/vscode-readme.md, ~10 lines)
  resume.md                      (existing: public/files/resume.md, via ?raw)
  src/
    data/apps.ts                 (snippet: first 40 lines)
    pages/index.astro            (snippet: first 40 lines)
home/mills/
  .bashrc                        (from virtualFs)
  .zshrc                         (from virtualFs via PR 2)
  .tmux.conf
  .config/nvim/init.lua
  .config/git/config
  .dotfiles/README.md
  about.txt
  experience.txt
  skills.txt
etc/
  motd
  hosts
  passwd
```

`/etc/shadow` (`priv: true`) is filtered out.

---

## Task 0: Pre-flight

- [ ] **Step 1: Confirm branch + dependencies**

```bash
git branch --show-current                                    # expect: phase-5c/45-vscode
git log --oneline origin/main | grep -E "dotfiles|virtual-fs" | head -3
git status --short
npm run check
```

Expected: branch matches; ≥2 lines from the grep (PR 1 + PR 2); empty status; 0 errors.

If PR 2 hasn't landed, **stop** — this PR depends on the dotfile entries existing in `virtualFs`.

- [ ] **Step 2: Confirm the "real repo file" paths referenced in the tree exist**

```bash
ls public/files/resume.md src/data/apps.ts src/pages/index.astro
```

All three must exist. If any is missing (moved or renamed), update the snippet list in Task 3 Step 2 accordingly.

---

## Task 1: Create shared types

**Files:**
- Create: `src/scripts/vscode/types.ts`

- [ ] **Step 1: Write the types module**

Create `src/scripts/vscode/types.ts`:

```ts
/*
 * Shared types for vscode.exe client modules.
 */

export interface VfsNode {
	/** full path, e.g. "/project/src/data/apps.ts" */
	path: string;
	/** leaf name displayed in the tree, e.g. "apps.ts" */
	name: string;
	type: 'file' | 'dir';
	/** file content (plain text). Absent for dirs. */
	content?: string;
	/** hint for the status-bar language label ('zsh' | 'lua' | 'markdown' | 'text' | etc.) */
	language?: string;
	/** children paths in tree order; only set for dirs */
	children?: string[];
}

export interface TabState {
	version: 1;
	openTabs: string[];
	activeTab: string | null;
}

export const MAX_OPEN_TABS = 20;
export const STORAGE_KEY = 'mills.vscode.v1';
export const STORAGE_DEBOUNCE_MS = 200;
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 2: Create the state module

**Files:**
- Create: `src/scripts/vscode/state.ts`

- [ ] **Step 1: Write the module**

Create `src/scripts/vscode/state.ts`:

```ts
/*
 * localStorage persistence for vscode.exe tab state.
 *
 * All storage access is wrapped in try/catch so private-mode browsers
 * degrade to stateless (no throws, no UI breakage).
 */

import { type TabState, MAX_OPEN_TABS, STORAGE_KEY, STORAGE_DEBOUNCE_MS } from './types';

function emptyState(): TabState {
	return { version: 1, openTabs: [], activeTab: null };
}

export function loadState(): TabState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return emptyState();
		const parsed = JSON.parse(raw) as Partial<TabState>;
		if (parsed.version !== 1 || !Array.isArray(parsed.openTabs)) return emptyState();
		// Cap tabs to MAX_OPEN_TABS, dropping oldest first (index 0 is oldest).
		const openTabs = parsed.openTabs.slice(-MAX_OPEN_TABS);
		const activeTab = typeof parsed.activeTab === 'string' && openTabs.includes(parsed.activeTab)
			? parsed.activeTab
			: (openTabs[openTabs.length - 1] ?? null);
		return { version: 1, openTabs, activeTab };
	} catch {
		return emptyState();
	}
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

export function saveState(state: TabState): void {
	if (writeTimer) clearTimeout(writeTimer);
	writeTimer = setTimeout(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// ignore — private mode or quota exceeded
		}
	}, STORAGE_DEBOUNCE_MS);
}

export function addTab(state: TabState, path: string): TabState {
	let openTabs = state.openTabs;
	if (!openTabs.includes(path)) {
		openTabs = [...openTabs, path];
		if (openTabs.length > MAX_OPEN_TABS) {
			openTabs = openTabs.slice(-MAX_OPEN_TABS);
		}
	}
	return { ...state, openTabs, activeTab: path };
}

export function closeTab(state: TabState, path: string): TabState {
	const openTabs = state.openTabs.filter((t) => t !== path);
	let activeTab = state.activeTab;
	if (activeTab === path) {
		// Pick neighbor: prefer the tab that was to the right, else the last tab.
		const idx = state.openTabs.indexOf(path);
		activeTab = state.openTabs[idx + 1] ?? openTabs[openTabs.length - 1] ?? null;
	}
	return { ...state, openTabs, activeTab };
}

export function switchTab(state: TabState, path: string): TabState {
	if (!state.openTabs.includes(path)) return state;
	return { ...state, activeTab: path };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 3: Create the file-tree module

Builds the vscode tree from the shared `virtualFs` plus a curated `project/` subtree sourced from real repo files via Vite `?raw` imports.

**Files:**
- Create: `src/scripts/vscode/file-tree.ts`
- Create: `src/data/vscode-readme.md` (the teaser file shown at `project/README.md`)

- [ ] **Step 1: Write `src/data/vscode-readme.md`**

Create `src/data/vscode-readme.md`. Short, in-voice:

```markdown
# millsymills.com — view source

this is an evocative reskin of vscode, not the real thing. the files
in the sidebar are real snippets of the real repo, frozen at build time
plus the fake home/ and etc/ shared with the terminal app.

the actual source lives at:
  github.com/millsmillsymills/millsymills.com

`npm run dev` runs the whole thing. MIT license.
```

- [ ] **Step 2: Write `src/scripts/vscode/file-tree.ts`**

Create `src/scripts/vscode/file-tree.ts`. All DOM clearing uses `replaceChildren()` — no `innerHTML`.

```ts
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

/** Files shown under project/ — curated, distinct from home/ and etc/. */
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
		if (entry.priv) continue;
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) continue;           // skip root
		const name = parts[parts.length - 1];
		nodes.set(path, {
			path,
			name,
			type: entry.type,
			content: entry.content,
			language: entry.language,
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
```

- [ ] **Step 3: Add `?raw` module declaration to env.d.ts**

Open `src/env.d.ts`. If the `declare module '*?raw'` block doesn't exist from PR 5, add it:

```ts
declare module '*?raw' {
	const content: string;
	export default content;
}
```

(Vite's `?raw` works on any extension; this one wildcard declaration covers all.)

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: 0 errors. If a path in `projectFiles` doesn't exist, the `?raw` import fails at build time — fix the path.

---

## Task 4: Create the tabs module

**Files:**
- Create: `src/scripts/vscode/tabs.ts`

- [ ] **Step 1: Write the module**

Create `src/scripts/vscode/tabs.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 5: Create the editor module

**Files:**
- Create: `src/scripts/vscode/editor.ts`

- [ ] **Step 1: Write the module**

Create `src/scripts/vscode/editor.ts`:

```ts
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

	const content = node.content ?? '';
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
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 6: Create the entry module

**Files:**
- Create: `src/scripts/vscode/index.ts`

- [ ] **Step 1: Write the entry**

Create `src/scripts/vscode/index.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 7: Create the Astro component shell + styles

**Files:**
- Create: `src/components/desktop/apps/VSCode.astro`
- Create: `src/styles/vscode.css`

- [ ] **Step 1: Write `VSCode.astro`**

Create `src/components/desktop/apps/VSCode.astro`:

```astro
---
import '../../../styles/vscode.css';

const gitSha = import.meta.env.PUBLIC_GIT_SHA ?? 'unknown';
const gitShaShort = gitSha.slice(0, 7);
---

<div class="vscode" data-vscode-root>
	<aside class="vscode-activitybar" aria-label="activity bar">
		<button type="button" class="vscode-activity-btn active" aria-label="files" title="files">🗎</button>
		<button type="button" class="vscode-activity-btn" title="v1 — coming soon" aria-label="search" disabled>🔍</button>
		<button type="button" class="vscode-activity-btn" title="v1 — coming soon" aria-label="source control" disabled>⎇</button>
		<button type="button" class="vscode-activity-btn" title="v1 — coming soon" aria-label="debug" disabled>🐞</button>
		<button type="button" class="vscode-activity-btn" title="v1 — coming soon" aria-label="extensions" disabled>🧩</button>
	</aside>

	<aside class="vscode-sidebar">
		<div class="vscode-sidebar-heading">EXPLORER</div>
		<div class="vscode-sidebar-tree"></div>
	</aside>

	<section class="vscode-main">
		<div class="vscode-tabs" role="tablist"></div>
		<div class="vscode-editor"></div>
	</section>

	<footer class="vscode-status">
		<span class="vscode-status-seg">⎇ main</span>
		<span class="vscode-status-seg"><code>{gitShaShort}</code></span>
		<span class="vscode-status-seg" data-status="line">Ln 1, Col 1</span>
		<span class="vscode-status-seg">UTF-8</span>
		<span class="vscode-status-seg" data-status="lang">plain text</span>
	</footer>
</div>

<script>
	import { initVscode } from '../../../scripts/vscode';

	function boot() {
		document.querySelectorAll<HTMLElement>('[data-vscode-root]').forEach((root) => initVscode(root));
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
</script>
```

- [ ] **Step 2: Write `src/styles/vscode.css`**

Create `src/styles/vscode.css`:

```css
/* vscode.exe — evocative reskin, pink-on-cream */

.vscode {
	display: grid;
	grid-template-columns: 48px 220px 1fr;
	grid-template-rows: 1fr 22px;
	grid-template-areas:
		'activity sidebar main'
		'status   status  status';
	height: 100%;
	background: var(--cream);
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.9rem;
}

.vscode-activitybar {
	grid-area: activity;
	background: var(--pink-500);
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 0.5rem 0;
	gap: 0.3rem;
}
.vscode-activity-btn {
	width: 32px;
	height: 32px;
	background: transparent;
	color: var(--cream);
	border: 1px solid transparent;
	cursor: pointer;
	font-size: 1rem;
}
.vscode-activity-btn.active {
	background: var(--pink-600);
	border-color: var(--cream);
}
.vscode-activity-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.vscode-sidebar {
	grid-area: sidebar;
	background: var(--pink-50);
	border-right: 1px solid var(--pink-300);
	overflow-y: auto;
}
.vscode-sidebar-heading {
	font-size: 0.72rem;
	letter-spacing: 0.08em;
	color: var(--pink-600);
	padding: 0.4rem 0.6rem;
	border-bottom: 1px solid var(--pink-200);
}
.vscode-tree-list {
	list-style: none;
	padding: 0;
	margin: 0;
}
.vscode-tree-list .vscode-tree-list {
	padding-left: 1rem;
}
.vscode-tree-row {
	padding: 0.12rem 0.55rem;
	cursor: pointer;
	font-size: 0.82rem;
	white-space: nowrap;
}
.vscode-tree-row:hover {
	background: var(--pink-100);
}

.vscode-main {
	grid-area: main;
	display: grid;
	grid-template-rows: auto 1fr;
	min-width: 0;
}
.vscode-tabs {
	display: flex;
	background: var(--pink-100);
	border-bottom: 1px solid var(--pink-300);
	overflow-x: auto;
}
.vscode-tab {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.25rem 0.55rem;
	font-size: 0.82rem;
	border-right: 1px solid var(--pink-300);
	cursor: pointer;
	color: var(--ink-soft);
	user-select: none;
}
.vscode-tab.active {
	background: var(--cream);
	color: var(--ink);
	border-bottom: 2px solid var(--pink-500);
}
.vscode-tab-close {
	background: transparent;
	border: 0;
	color: inherit;
	font-size: 0.9rem;
	cursor: pointer;
	padding: 0 0.15rem;
	line-height: 1;
}
.vscode-tab-close:hover {
	background: var(--pink-200);
	border-radius: 3px;
}

.vscode-editor {
	display: grid;
	grid-template-columns: 3rem 1fr;
	overflow: auto;
	background: var(--cream);
}
.vscode-editor-gutter,
.vscode-editor-code {
	margin: 0;
	padding: 0.4rem 0.6rem;
	font-family: var(--font-mono);
	font-size: 0.82rem;
	line-height: 1.4;
	white-space: pre;
}
.vscode-editor-gutter {
	color: var(--ink-soft);
	background: var(--pink-50);
	text-align: right;
	user-select: none;
	border-right: 1px solid var(--pink-200);
}
.vscode-editor-empty {
	padding: 1rem;
	color: var(--ink-soft);
	font-style: italic;
}

.vscode-status {
	grid-area: status;
	background: var(--pink-500);
	color: var(--cream);
	display: flex;
	align-items: center;
	gap: 0.8rem;
	padding: 0 0.6rem;
	font-size: 0.75rem;
}
.vscode-status-seg code {
	font-family: inherit;
	color: var(--cream);
}

/* mobile: 2-pane stacked */
@media (max-width: 768px) {
	.vscode {
		grid-template-columns: 1fr;
		grid-template-rows: 40% 60%;
		grid-template-areas:
			'sidebar'
			'main';
	}
	.vscode-activitybar,
	.vscode-status {
		display: none;
	}
	.vscode-sidebar {
		border-right: 0;
		border-bottom: 1px solid var(--pink-300);
	}
}
```

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 8: Wire the app into `apps.ts` + Desktop + Mobile

**Files:**
- Modify: `src/data/apps.ts`
- Modify: `src/components/desktop/Desktop.astro`
- Modify: `src/components/desktop/MobileFallback.astro`

- [ ] **Step 1: Add to `apps.ts`**

Insert this entry (location in the array is cosmetic — affects icon order):

```ts
	{
		id: 'vscode',
		label: 'vscode',
		glyph: '🆅',
		title: 'vscode.exe',
		ogDescription: 'an evocative, pink-tinted vscode reskin. browse real dotfiles and snippets of the site\'s own source.',
		x: 140,
		y: 80,
		width: 900,
		height: 620,
	},
```

- [ ] **Step 2: Wire `VSCode.astro` into Desktop.astro + MobileFallback.astro**

Same pattern as PRs 3 and 4. `grep -n "Privacy\|About\|Mail" src/components/desktop/Desktop.astro` to find the existing wiring; add `VSCode` equivalent. Same for `MobileFallback.astro`.

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 9: Update privacy page's localStorage list

Per the spec's honesty constraint: vscode.exe writes a new localStorage key, so the privacy page must document it the moment vscode ships.

**Files:**
- Modify: `src/data/privacy-copy.ts`

- [ ] **Step 1: Add `mills.vscode.v1` entry**

Open `src/data/privacy-copy.ts`. Find the `localStorageKeys` array. Add a new entry at the end:

```ts
	{ key: 'mills.vscode.v1', purpose: 'vscode.exe open tabs + active tab' },
```

- [ ] **Step 2: Type-check**

```bash
npm run check
```

Expected: 0 errors.

---

## Task 10: Smoke

- [ ] **Step 1: Start the dev server and verify the app**

```bash
npm run dev
```

Desktop walkthrough (in Chrome or similar):
1. Double-click vscode icon on desktop — window opens
2. Sidebar shows `project/`, `home/`, `etc/` collapsible folders; expand each
3. Click `project/README.md` — tab opens, editor shows the teaser text with line numbers
4. Click `project/src/data/apps.ts` — second tab, snippet visible with the "see the real file" trailer
5. Click `home/mills/.zshrc` (assuming PR 2 merged) — third tab
6. Close the second tab via × — editor switches to the neighbor
7. Active tab has the pink underline accent
8. Status bar shows `⎇ main · <short-sha> · Ln 1, Col 1 · UTF-8 · <language>` where language matches the open file
9. Reload the page — tabs restore, same active tab
10. `/etc/shadow` is **not** visible in the tree (priv filter works)
11. Open Chrome devtools → Application → Local Storage → `http://localhost:4321` — confirm `mills.vscode.v1` key present with the expected JSON shape

- [ ] **Step 2: Mobile viewport**

Chrome devtools device toolbar → iPhone 13. Open vscode app. Confirm:
- No activity bar, no status bar (hidden via media query)
- Sidebar (top 40%) scrollable; tap a file
- Editor (bottom 60%) shows content
- Tab bar visible at top of editor area
- Layout fits within viewport (no horizontal scroll on the outer container)

- [ ] **Step 3: Privacy page now lists the vscode key**

Open `/privacy/` — confirm `mills.vscode.v1` listed under localStorage keys.

Kill dev server.

---

## Task 11: Final verification + commits

- [ ] **Step 1: Clean, check, build**

```bash
git status --short
npm run check
SITE_URL=https://millsymills.com npm run build
```

Expected: list of new files (un-committed at this point — about to commit below); 0 errors; build exits 0.

- [ ] **Step 2: Confirm all four routes + OG images built**

```bash
ls dist/vscode/index.html dist/og/vscode.svg
```

Both present.

- [ ] **Step 3: Stage and commit in logical chunks**

**Commit 1 — types, modules, astro component, css:**

```bash
git add src/scripts/vscode/ src/components/desktop/apps/VSCode.astro src/styles/vscode.css src/data/vscode-readme.md src/env.d.ts
git commit -m "$(cat <<'EOF'
feat(vscode): evocative vscode.exe desktop app (#45)

Shell + file-tree + tabs + plain-text editor + status bar. File tree
sources from shared virtualFs (PR 1) plus curated project/ snippets
from real repo files via Vite ?raw imports. priv:true entries are
filtered out. localStorage under mills.vscode.v1 persists tabs.

Mobile fallback: 2-pane stacked (list above, content below), hides
activity bar + status bar.

All DOM mutations via replaceChildren() / textContent / dataset —
no innerHTML.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Commit 2 — apps.ts entry + Desktop/Mobile wires:**

```bash
git add src/data/apps.ts src/components/desktop/Desktop.astro src/components/desktop/MobileFallback.astro
git commit -m "$(cat <<'EOF'
feat(desktop): wire vscode.exe into apps + launcher (#45)

Adds vscode entry to apps.ts and registers the VSCode component with
Desktop and MobileFallback per the existing per-app wiring pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Commit 3 — privacy page update:**

```bash
git add src/data/privacy-copy.ts
git commit -m "$(cat <<'EOF'
docs(privacy): document mills.vscode.v1 localStorage key (#45)

vscode.exe shipped this PR and writes to localStorage; the privacy
page must list it to stay accurate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commits on branch**

```bash
git log --oneline origin/main..HEAD
```

Expected (newest first):
```
<sha> docs(privacy): document mills.vscode.v1 localStorage key (#45)
<sha> feat(desktop): wire vscode.exe into apps + launcher (#45)
<sha> feat(vscode): evocative vscode.exe desktop app (#45)
```

Three commits.

---

## Task 12: Push + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin phase-5c/45-vscode
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: vscode.exe desktop app (#45)" --body "$(cat <<'EOF'
Closes #45.

## Summary
- New \`vscode.exe\` desktop app: activity bar (inert except Files), collapsible file-tree sidebar, tab strip with close/switch, plain-text editor with line-number gutter, status bar with commit SHA from \`PUBLIC_GIT_SHA\`
- File tree sources from shared \`virtualFs\` (PR 1) + curated \`project/\` snippets of real repo files via Vite \`?raw\` imports; \`priv:true\` entries filtered out
- localStorage persistence under \`mills.vscode.v1\` (debounced, capped at 20 tabs)
- Mobile fallback: 2-pane stacked layout (list above, content below), activity bar + status bar hidden
- Updates /privacy/ to list the new localStorage key
- All DOM writes via \`replaceChildren()\` / \`textContent\` / \`dataset\` — no \`innerHTML\`, no XSS surface

## Out of scope (follow-up issues)
- Syntax highlighting via shiki
- Cmd-P quick-open
- Hidden 11th CTF flag inside a file (requires flags.exe copy bump)
- Source-Control tab with real git log
- Activity-bar panels beyond Files

## Test plan
- [ ] \`npm run check\` clean
- [ ] \`npm run build\` clean; \`dist/vscode/index.html\` exists
- [ ] Desktop: tree expands, click opens tab, × closes, active tab highlighted, status bar shows SHA
- [ ] Persistence: reload page, tabs restore, active tab preserved
- [ ] Mobile viewport: 2-pane layout, no activity/status bars
- [ ] \`/etc/shadow\` not visible in tree (priv filter)
- [ ] Privacy page lists \`mills.vscode.v1\`
- [ ] \`./scripts/assert-no-url-leakage.sh\` passes

Spec: \`docs/superpowers/specs/2026-04-20-phase-5c-batch-design.md\`
Depends on: #<PR-1 number> + #<PR-2 number> merged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Definition of done

- All tasks' checkboxes checked
- CI passes
- vscode.exe opens, file tree renders, tabs work, status bar shows SHA
- Mobile layout collapses to 2-pane
- Privacy page lists `mills.vscode.v1`
- No `priv:true` files visible in the vscode tree
- localStorage persistence verified via devtools reload cycle
- No `innerHTML` anywhere in the new source
