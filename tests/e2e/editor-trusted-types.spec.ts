import { expect, test } from '@playwright/test';

test('highlighted editor works with enforced Trusted Types and no HTML policy', async ({ page, baseURL }) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.route('**/*', async route => {
		const url = new URL(route.request().url());
		if (url.origin !== new URL(baseURL!).origin) return route.abort();
		const response = await route.fetch();
		await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "require-trusted-types-for 'script'; trusted-types default unifi-demo" } });
	});
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
		localStorage.setItem('mills.welcome.seen', '1');
		localStorage.setItem('mills.vscode.v1', JSON.stringify({ version: 1, openTabs: ['/home/mills/.zshrc'], activeTab: '/home/mills/.zshrc' }));
	});
	await page.goto('/vscode/');
	await expect(page.locator('.vscode-editor-code .shiki')).toBeVisible();
	await expect(page.locator('.vscode-editor-code .shiki')).toContainText('export');
	expect(await page.locator('.vscode-editor-code span[style]').count()).toBeGreaterThan(0);
	expect(errors).toEqual([]);
	// Negative control: enforcement still rejects plain HTML at its actual sink.
	expect(await page.evaluate(() => {
		try { new DOMParser().parseFromString('<b>blocked</b>', 'text/html'); return false; }
		catch (error) { return error instanceof TypeError; }
	})).toBe(true);
});
