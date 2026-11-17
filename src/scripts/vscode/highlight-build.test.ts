// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('shiki', () => ({ createHighlighter: vi.fn() }));
import { createHighlighter } from 'shiki';
import { prerenderHighlights } from './highlight-build.mjs';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
test('CI refuses initialization failure', async () => {
	vi.stubEnv('CI', 'true');
	vi.mocked(createHighlighter).mockRejectedValueOnce(new Error('synthetic init failure'));
	await expect(prerenderHighlights()).rejects.toThrow(/init failed/);
});
test('local initialization failure retains plain-text fallback', async () => {
	vi.stubEnv('CI', 'false');
	vi.mocked(createHighlighter).mockRejectedValueOnce(new Error('synthetic init failure'));
	await expect(prerenderHighlights()).resolves.toEqual({});
});
test('CI refuses all per-file failures and disposes the highlighter', async () => {
	vi.stubEnv('CI', 'true');
	const actual = await vi.importActual<typeof import('shiki')>('shiki');
	const highlighter = await actual.createHighlighter({ themes: [], langs: [] });
	vi.spyOn(highlighter, 'codeToTokens').mockImplementation(() => { throw new Error('synthetic grammar failure'); });
	const dispose = vi.spyOn(highlighter, 'dispose');
	vi.mocked(createHighlighter).mockResolvedValueOnce(highlighter);
	await expect(prerenderHighlights()).rejects.toThrow(/all .* sources failed/);
	expect(dispose).toHaveBeenCalledOnce();
});
test('healthy real tokenization preserves source text including final newline', async () => {
	const actual = await vi.importActual<typeof import('shiki')>('shiki');
	vi.mocked(createHighlighter).mockImplementationOnce(actual.createHighlighter);
	const result = await prerenderHighlights();
	const { readFile } = await import('node:fs/promises');
	const content = await readFile(new URL('../../data/dotfiles/zshrc.zsh', import.meta.url), 'utf8');
	expect(result['/home/mills/.zshrc']?.map(line => line.map(token => token.content).join('')).join('\n')).toBe(content);
	expect(Object.keys(result).length).toBeGreaterThan(7);
});
