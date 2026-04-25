/*
 * Shared types for vscode.exe client modules.
 *
 * VfsNode is a discriminated union on `type` so the compiler enforces the
 * file/dir invariants for free: no `node.children!` on a file, no
 * `node.content ?? ''` on a dir. Narrowing via `if (node.type === 'file')`
 * gives the right shape on both branches.
 */

interface VfsFileNode {
	type: 'file';
	/** full path, e.g. "/project/src/data/apps.ts" */
	path: string;
	/** leaf name displayed in the tree, e.g. "apps.ts" */
	name: string;
	/** file content (plain text) */
	content: string;
	/** hint for the status-bar language label ('zsh' | 'lua' | 'markdown' | 'text' | etc.) */
	language?: string;
}

interface VfsDirNode {
	type: 'dir';
	path: string;
	name: string;
	/** children paths in tree order */
	children: string[];
}

export type VfsNode = VfsFileNode | VfsDirNode;
export type { VfsFileNode, VfsDirNode };

export interface TabState {
	version: 1;
	openTabs: string[];
	activeTab: string | null;
}

export const MAX_OPEN_TABS = 20;
export const STORAGE_KEY = 'mills.vscode.v1';
export const STORAGE_DEBOUNCE_MS = 200;
