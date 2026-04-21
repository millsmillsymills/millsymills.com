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
