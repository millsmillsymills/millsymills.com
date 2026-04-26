/**
 * Build-time shiki prerender for vscode.exe's editor pane.
 *
 * The editor opens 8–12 known files, all sourced either from `?raw` snippet
 * imports or fixtures under `src/data/dotfiles/`. Highlighting at build time
 * keeps shiki out of the runtime bundle entirely — the editor pane just
 * pastes the prerendered `<pre class="shiki">` HTML and the page only pays
 * for the inlined strings (no grammar JSON, no oniguruma WASM, no theme
 * loader).
 *
 * Inputs MUST stay in lock-step with what `src/scripts/vscode/file-tree.ts`
 * actually puts on screen — the snippet truncation and `<site>` URL scrub
 * mirror file-tree.ts and astro.config.mjs's scrubVscodeSnippets plugin
 * exactly. If those drift, the highlighted bytes will diverge from the
 * displayed bytes (visible as a teaser comment positioned wrong, or a
 * bare `https://millsymills.com` in the highlighted source even though
 * runtime renders `<site>`).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHighlighter } from 'shiki';

import { neonNoirTheme } from './shiki-theme.mjs';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');

/** Snippet length + suffix MUST match file-tree.ts. */
const SNIPPET_LINES = 40;
const TS_SUFFIX = '\n/* ...snippet — see the real file on github... */\n';
const ASTRO_SUFFIX = '\n{/* ...snippet — see the real file on github... */}\n';

/**
 * Map vscode tree paths → repo-relative source files + shiki language.
 *
 * `language` is the shiki grammar id, not the virtualFs `Language` enum —
 * `conf` → `ini`, `zsh` → `shellscript`. Plain-text files (`.txt`, `motd`,
 * `hosts`, `passwd`) are deliberately absent: the editor falls through to
 * its plain-text path for anything not in this map.
 */
const SOURCES = [
	{ vscodePath: '/home/mills/.zshrc', sourceFile: 'src/data/dotfiles/zshrc.zsh', lang: 'shellscript' },
	{ vscodePath: '/home/mills/.tmux.conf', sourceFile: 'src/data/dotfiles/tmux.conf', lang: 'ini' },
	{ vscodePath: '/home/mills/.config/nvim/init.lua', sourceFile: 'src/data/dotfiles/nvim-init.lua', lang: 'lua' },
	{ vscodePath: '/home/mills/.config/git/config', sourceFile: 'src/data/dotfiles/git-config', lang: 'ini' },
	{ vscodePath: '/home/mills/.dotfiles/README.md', sourceFile: 'src/data/dotfiles/readme.md', lang: 'markdown' },
	{ vscodePath: '/home/mills/.dotfiles/CLAUDE.md', sourceFile: 'src/data/dotfiles/claude-md.md', lang: 'markdown' },
	// Same source as .dotfiles/CLAUDE.md — virtualFs mirrors it at the installed path.
	{ vscodePath: '/home/mills/.claude/CLAUDE.md', sourceFile: 'src/data/dotfiles/claude-md.md', lang: 'markdown' },
	{ vscodePath: '/project/README.md', sourceFile: 'src/data/vscode-readme.md', lang: 'markdown' },
	{ vscodePath: '/project/resume.md', sourceFile: 'public/files/resume.md', lang: 'markdown' },
	{
		vscodePath: '/project/src/data/apps.ts',
		sourceFile: 'src/data/apps.ts',
		lang: 'typescript',
		snippet: { lines: SNIPPET_LINES, suffix: TS_SUFFIX, scrub: true },
	},
	{
		vscodePath: '/project/src/pages/index.astro',
		sourceFile: 'src/pages/index.astro',
		lang: 'astro',
		snippet: { lines: SNIPPET_LINES, suffix: ASTRO_SUFFIX, scrub: true },
	},
];

/**
 * Read source files, run shiki, return `{ vscodePath: html }`.
 *
 * Soft-fails on a missing grammar or unreadable source: logs a warning and
 * omits that entry from the map so the editor falls through to plain text.
 * A missing grammar should never break the build.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function prerenderHighlights() {
	let highlighter;
	try {
		highlighter = await createHighlighter({
			themes: [neonNoirTheme],
			langs: ['shellscript', 'ini', 'lua', 'markdown', 'typescript', 'astro'],
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(`[vscode-highlights] shiki init failed (${msg}); editor will render plain text`);
		return {};
	}

	const out = /** @type {Record<string, string>} */ ({});
	for (const { vscodePath, sourceFile, lang, snippet } of SOURCES) {
		let content;
		try {
			content = await readFile(path.resolve(repoRoot, sourceFile), 'utf8');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[vscode-highlights] could not read ${sourceFile} (${msg}); skipping`);
			continue;
		}
		if (snippet) {
			content = content.split('\n').slice(0, snippet.lines).join('\n') + snippet.suffix;
			if (snippet.scrub) {
				content = content.replace(/https:\/\/millsymills\.com/g, '<site>');
			}
		}
		try {
			out[vscodePath] = highlighter.codeToHtml(content, { lang, theme: 'neon-noir' });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[vscode-highlights] shiki failed on ${vscodePath} (${msg}); skipping`);
		}
	}
	highlighter.dispose();

	// CI safety net: a green build with zero highlights is the exact symptom
	// you'd miss in QA — every editor file silently falling through to plain
	// text. Locally we soft-fail (logged warning above), in CI we refuse to
	// ship the regression. Mirrors the SHA-or-bust pattern in readGitSha.
	if (process.env.CI === 'true' && Object.keys(out).length === 0 && SOURCES.length > 0) {
		throw new Error(
			`[vscode-highlights] all ${SOURCES.length} sources failed to prerender in CI. Refusing to ship a build where vscode.exe's editor would silently render plain text. See warnings above for the underlying error.`,
		);
	}
	return out;
}
