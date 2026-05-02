/*
 * Ambient declaration for the `window.mills` namespace.
 *
 * Multiple init paths (DesktopLayout boot script, reset.ts, clippy.ts)
 * write into this object as a co-operative meeting place — each owns
 * its own keys (`flag`, `reset`, `__resetInit`, `__clippyInit`, etc.)
 * and uses `Object.assign(w.mills ??= {}, ...)` to merge without
 * clobbering siblings. Declaring the shape once here prevents three
 * `as unknown as { mills?: ... }` casts from drifting independently.
 */

declare global {
	interface Window {
		mills?: Record<string, unknown>;
	}
}

export {};
