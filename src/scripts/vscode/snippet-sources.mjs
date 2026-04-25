/**
 * Single source of truth for source files that vscode.exe surfaces via Vite
 * `?raw` imports AND that legitimately embed `https://millsymills.com` (the
 * production literal that `assert-no-url-leakage.sh` rejects in dist/).
 *
 * astro.config.mjs's scrubVscodeSnippets Vite plugin reads this list so it
 * only rewrites the files that need rewriting (no quietly-rewriting random
 * ?raw imports of real config or data files). file-tree.ts mirrors its own
 * literal `?raw` imports and asserts the two lists agree at module load —
 * adding a snippet without registering, or registering one that has no
 * `?raw` consumer, fires a clear error pointing developers here.
 */
export const VSCODE_SNIPPET_SOURCES = Object.freeze([
	'/src/pages/index.astro',
	'/src/data/apps.ts',
	'/public/files/resume.md',
]);
