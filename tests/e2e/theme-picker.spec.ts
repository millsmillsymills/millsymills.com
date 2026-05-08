import { expect, test, type Page } from '@playwright/test';

const themeStateKey = 'mills.theme.v1';
const wallpaperStateKey = 'mills.wallpaper.v1';

async function suppressBoot(page: Page): Promise<void> {
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
	});
}

test.describe('theme picker', () => {
	test.beforeEach(async ({ page }) => {
		await suppressBoot(page);
	});

	test('applies selected theme and persists alongside wallpaper choice', async ({ page }) => {
		await page.goto('/display/');

		await page.getByRole('button', { name: 'set theme: hacker' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'hacker');
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), themeStateKey))
			.toBe('hacker');

		await page.getByRole('button', { name: 'set wallpaper: arizona iced tea' }).click();
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), wallpaperStateKey))
			.toBe('arizona');

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'hacker');
		await expect(page.getByRole('button', { name: 'set theme: hacker' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(page.getByRole('button', { name: 'set wallpaper: arizona iced tea' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});
});
