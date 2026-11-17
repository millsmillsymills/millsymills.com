import { expect, test } from '@playwright/test';
import { gradeCsp } from '../../src/scripts/inspector-csp';

const controls = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
for (const [sources, allowsInline] of [
	["'unsafe-inline' 'nonce-'", true],
	["'UNSAFE-INLINE'", true],
	["'unsafe-inline' 'nonce-YWJjZA=='", false],
	["'unsafe-inline' 'sha256-'", true],
	["'unsafe-inline' 'STRICT-DYNAMIC'", false],
] as const) {
	test(`Inspector inline grade agrees with browser for ${sources}`, async ({ page }) => {
		const policy = `script-src ${sources}; ${controls}`;
		// Every request is answered locally; no production or external traffic.
		await page.route('**/*', route => route.fulfill({
			contentType: 'text/html',
			headers: { 'content-security-policy': policy },
			body: '<!doctype html><body><script>document.body.dataset.executed = "yes";</script></body>',
		}));
		await page.goto('/synthetic-csp');
		expect(await page.locator('body').getAttribute('data-executed')).toBe(allowsInline ? 'yes' : null);
		expect(gradeCsp(policy).grade).toBe(allowsInline ? 'C' : 'A');
	});
}
