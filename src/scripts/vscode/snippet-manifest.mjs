/**
 * Single source of truth for vscode.exe's curated `/project/` subtree —
 * the four files that get displayed as evocative real-repo snippets.
 *
 * Three things have to stay in lock-step or the editor lies about what
 * it's showing:
 *
 *   1. file-tree.ts's `projectFiles` map (display-time truncation + suffix)
 *   2. highlight-build.mjs's prerender pipeline (build-time shiki HTML)
 *   3. astro.config.mjs's scrubVscodeSnippets Vite plugin (URL scrub registry)
 *
 * Pre-2026-04-26 each consumer carried its own copy of SNIPPET_LINES, the
 * suffix strings, and the path/source mapping. Drift was caught only when
 * `assert-no-url-leakage.sh` happened to fire — silent UX bugs (highlighted
 * source one suffix wording, displayed source another) could land green.
 *
 * Note on scrubbing: applySnippet runs the URL scrub on every `scrubUrl`
 * entry. For file-tree.ts's `?raw` imports the Vite plugin has already
 * scrubbed the raw bytes by the time applySnippet sees them, so the regex
 * matches nothing — defense in depth, not a no-op by accident. For
 * highlight-build.mjs, which reads files via fs.readFile and bypasses Vite
 * entirely, applySnippet is the ONLY scrubber on that path.
 */

const SNIPPET_LINES = 40;
const TS_SUFFIX = '\n/* ...snippet — see the real file on github... */\n';
const ASTRO_SUFFIX = '\n{/* ...snippet — see the real file on github... */}\n';

/**
 * @typedef {object} ProjectSnippet
 * @property {string} vscodePath        Path shown in the vscode.exe tree, e.g. '/project/src/data/apps.ts'.
 * @property {string} rawImportPath     Vite-relative literal used for `?raw` imports + URL scrub registry, e.g. '/src/data/apps.ts'.
 * @property {string} sourceFile        Repo-relative path used by build-time fs reads, e.g. 'src/data/apps.ts'.
 * @property {string} language          Shiki grammar id ('typescript', 'astro', 'markdown', ...).
 * @property {boolean} scrubUrl         If true, run the production-URL scrub on the snippet content.
 * @property {{ lines: number, suffix: string } | null} snippet
 *           If non-null, truncate to `lines` and append `suffix`. If null, ship the raw file as-is.
 */

/** @type {ReadonlyArray<ProjectSnippet>} */
export const PROJECT_SNIPPETS = Object.freeze([
	{
		vscodePath: '/project/README.md',
		rawImportPath: '/src/data/vscode-readme.md',
		sourceFile: 'src/data/vscode-readme.md',
		language: 'markdown',
		scrubUrl: false,
		snippet: null,
	},
	{
		vscodePath: '/project/resume.md',
		rawImportPath: '/public/files/resume.md',
		sourceFile: 'public/files/resume.md',
		language: 'markdown',
		scrubUrl: true,
		snippet: null,
	},
	{
		vscodePath: '/project/src/data/apps.ts',
		rawImportPath: '/src/data/apps.ts',
		sourceFile: 'src/data/apps.ts',
		language: 'typescript',
		scrubUrl: true,
		snippet: { lines: SNIPPET_LINES, suffix: TS_SUFFIX },
	},
	{
		vscodePath: '/project/src/pages/index.astro',
		rawImportPath: '/src/pages/index.astro',
		sourceFile: 'src/pages/index.astro',
		language: 'astro',
		scrubUrl: true,
		snippet: { lines: SNIPPET_LINES, suffix: ASTRO_SUFFIX },
	},
]);

/**
 * Apply URL scrub + truncation + suffix to a raw source string. Both
 * display-time (file-tree.ts) and build-time (highlight-build.mjs) call
 * this so their byte output is identical for the same input.
 *
 * Order matters: scrub BEFORE truncate. If the production URL ever
 * straddles the line-N boundary (e.g. `Astro.site ?? 'https://millsymi`
 * | line N+1: `lls.com/'`), truncating first would split the literal
 * and the regex would miss the prefix half — partial URL bleed in dist/.
 *
 * @param {string} raw
 * @param {ProjectSnippet} entry
 * @returns {string}
 */
export function applySnippet(raw, entry) {
	let out = raw;
	if (entry.scrubUrl) {
		out = out.replace(/https:\/\/millsymills\.com/g, '<site>');
	}
	if (entry.snippet) {
		out = out.split('\n').slice(0, entry.snippet.lines).join('\n') + entry.snippet.suffix;
	}
	return out;
}
