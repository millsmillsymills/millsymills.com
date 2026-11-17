import { afterEach, expect, test, vi } from 'vitest';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });
test('renders literal token text and line boundaries without HTML parsing', async () => {
	const content = '<img src=x onerror=alert(1)>\nlast\n';
	const highlights = { '/synthetic': [
		[{ content: '<img src=x onerror=alert(1)>', color: '#ff0000', fontStyle: 7 }],
		[{ content: 'last' }], [],
	] };
	const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => { throw new TypeError('TrustedHTML required'); });
	try {
		const { renderEditor } = await import('./editor');
		const host = document.createElement('div');
		expect(renderEditor(host, { type: 'file', path: '/synthetic', name: 'synthetic', content, language: 'html' }, highlights).language).toBe('html');
		expect(host.querySelector('code')?.textContent).toBe(content);
		expect(host.querySelector('img')).toBeNull();
		expect(host.querySelector<HTMLElement>('code .line span')?.style.fontWeight).toBe('bold');
		expect(host.querySelector('.vscode-editor-gutter')?.textContent).toBe('   1\n   2\n   3');
		expect(parse).not.toHaveBeenCalled();
	} finally { parse.mockRestore(); }
});
test('unhighlighted files and empty editor retain their fallback', async () => {
	const { renderEditor } = await import('./editor');
	const host = document.createElement('div');
	renderEditor(host, { type: 'file', path: '/text', name: 'text', content: '<b>literal</b>' }, {});
	expect(host.querySelector('pre.vscode-editor-plain')?.textContent).toBe('<b>literal</b>');
	renderEditor(host, null);
	expect(host.textContent).toBe('no file open');
});
