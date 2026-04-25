/*
 * Thin adapter over src/data/virtual-fs.ts.
 *
 * Returns a writable map so callers can add/remove paths (sudo builds an
 * elevated view this way), but the entries themselves are frozen at the
 * source — to "modify" an entry, construct a new one. Re-exports `Entry`
 * so existing importers (registry.ts) don't have to change.
 */

import { virtualFs, type Entry } from '../../data/virtual-fs';

export type { Entry } from '../../data/virtual-fs';

export function buildFs(): Record<string, Entry> {
	return { ...virtualFs };
}
