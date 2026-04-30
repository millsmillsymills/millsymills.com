/*
 * Early-load bootstrap — read the persisted wallpaper choice from
 * localStorage and set the `--desktop-bg` CSS variable on
 * documentElement before the desktop's first paint.
 *
 * Loaded from <head> in DesktopLayout.astro so that:
 *   - the externalized module fetches in parallel with the rest of
 *     the page
 *   - module-script auto-defer runs at end-of-parse, BEFORE first
 *     paint (in practice; not spec-mandated)
 *   - the CSS rule `background-image: var(--desktop-bg)` paints the
 *     selected wallpaper from the first frame
 *
 * Without this, the desktop would render with the dark void bg until
 * the picker UI module loaded — visible flash.
 */

import { applyToDocument, getActiveId, resolveWallpaper } from './wallpaper';

applyToDocument(resolveWallpaper(getActiveId()));
