/*
 * Thin adapter over src/data/virtual-fs.ts.
 *
 * Existed historically as the data owner; now just clones the shared tree so
 * terminal mutations (if any are added later) can't leak into other consumers
 * like vscode.exe. Re-exports `Entry` so existing importers (registry.ts)
 * don't have to change.
 */

import { virtualFs, type Entry } from '../../data/virtual-fs';

export type { Entry } from '../../data/virtual-fs';

export function buildFs(): Record<string, Entry> {
	return { ...virtualFs };
}
