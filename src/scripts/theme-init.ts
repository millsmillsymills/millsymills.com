/*
 * Early-load bootstrap — read persisted theme from localStorage and set
 * <html data-theme="..."> before first paint, matching wallpaper-init.
 */

import { applyToDocument, getActiveId, resolveTheme } from './theme';

applyToDocument(resolveTheme(getActiveId()));
