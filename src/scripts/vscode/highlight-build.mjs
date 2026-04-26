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
 * Two source-of-truth sets:
 *
 *   1. /project/ snippets — driven by `snippet-manifest.mjs`. file-tree.ts
 *      and astro.config.mjs's URL-scrub plugin both read the same manifest,
 *      so highlighted bytes match displayed bytes byte-for-byte.
 *
 *   2. /home/ + /etc/ dotfile fixtures — declared inline below as DOTFILE_SOURCES.
 *      These come from virtualFs at display time (which has its own ?raw
 *      imports of the same files), so there's no shared substrate to consume.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHighlighter } from 'shiki';

import { neonNoirTheme } from './shiki-theme.mjs';
import { PROJECT_SNIPPETS, applySnippet } from './snippet-manifest.mjs';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');

/**
 * Map vscode tree paths → repo-relative source files + shiki language for
 * the dotfile/etc fixtures. Plain-text files (`.txt`, `motd`, `hosts`,
 * `passwd`) are deliberately absent: the editor falls through to its
 * plain-text path for anything not in this map.
 *
 * @typedef {{ vscodePath: string, sourceFile: string, language: string }} DotfileSource
 * @type {ReadonlyArray<DotfileSource>}
 */
const DOTFILE_SOURCES = Object.freeze([
	{ vscodePath: '/home/mills/.zshrc', sourceFile: 'src/data/dotfiles/zshrc.zsh', language: 'shellscript' },
	{ vscodePath: '/home/mills/.tmux.conf', sourceFile: 'src/data/dotfiles/tmux.conf', language: 'ini' },
	{ vscodePath: '/home/mills/.config/nvim/init.lua', sourceFile: 'src/data/dotfiles/nvim-init.lua', language: 'lua' },
	{ vscodePath: '/home/mills/.config/git/config', sourceFile: 'src/data/dotfiles/git-config', language: 'ini' },
	{ vscodePath: '/home/mills/.dotfiles/README.md', sourceFile: 'src/data/dotfiles/readme.md', language: 'markdown' },
	{ vscodePath: '/home/mills/.dotfiles/CLAUDE.md', sourceFile: 'src/data/dotfiles/claude-md.md', language: 'markdown' },
	// Same source as .dotfiles/CLAUDE.md — virtualFs mirrors it at the installed path.
	{ vscodePath: '/home/mills/.claude/CLAUDE.md', sourceFile: 'src/data/dotfiles/claude-md.md', language: 'markdown' },
]);

/**
 * Read source files, run shiki, return `{ vscodePath: html }`.
 *
 * Soft-fails on a missing grammar or unreadable source: logs a warning and
 * omits that entry from the map so the editor falls through to plain text.
 * A missing grammar should never break the build — but a build where ALL
 * entries failed is treated as a CI regression and throws (see end of fn).
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

	// 1. Dotfile fixtures — read raw, no truncation/scrub.
	for (const { vscodePath, sourceFile, language } of DOTFILE_SOURCES) {
		const html = await highlightFile(highlighter, sourceFile, language, vscodePath, (raw) => raw);
		if (html !== null) out[vscodePath] = html;
	}

	// 2. /project/ snippets — driven by the shared manifest. applySnippet
	// produces the byte-identical content that file-tree.ts displays, so
	// shiki highlights exactly what the user sees.
	for (const entry of PROJECT_SNIPPETS) {
		const html = await highlightFile(
			highlighter,
			entry.sourceFile,
			entry.language,
			entry.vscodePath,
			(raw) => applySnippet(raw, entry),
		);
		if (html !== null) out[entry.vscodePath] = html;
	}

	highlighter.dispose();

	const totalSources = DOTFILE_SOURCES.length + PROJECT_SNIPPETS.length;

	// CI safety net: a green build with zero highlights is the exact symptom
	// you'd miss in QA — every editor file silently falling through to plain
	// text. Locally we soft-fail (logged warning above), in CI we refuse to
	// ship the regression. Mirrors the SHA-or-bust pattern in readGitSha.
	if (process.env.CI === 'true' && Object.keys(out).length === 0 && totalSources > 0) {
		throw new Error(
			`[vscode-highlights] all ${totalSources} sources failed to prerender in CI. Refusing to ship a build where vscode.exe's editor would silently render plain text. See warnings above for the underlying error.`,
		);
	}
	return out;
}

/**
 * Read + transform + highlight one file. Returns null on any error so the
 * caller can omit the entry from the output map.
 *
 * @param {Awaited<ReturnType<typeof createHighlighter>>} highlighter
 * @param {string} sourceFile  Repo-relative source path
 * @param {string} language    Shiki grammar id
 * @param {string} vscodePath  For the warning message
 * @param {(raw: string) => string} transform
 * @returns {Promise<string | null>}
 */
async function highlightFile(highlighter, sourceFile, language, vscodePath, transform) {
	let content;
	try {
		const raw = await readFile(path.resolve(repoRoot, sourceFile), 'utf8');
		content = transform(raw);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(`[vscode-highlights] could not read ${sourceFile} (${msg}); skipping ${vscodePath}`);
		return null;
	}
	try {
		return highlighter.codeToHtml(content, { lang: language, theme: 'neon-noir' });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(`[vscode-highlights] shiki failed on ${vscodePath} (${msg}); skipping`);
		return null;
	}
}
