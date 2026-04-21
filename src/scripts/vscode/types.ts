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
