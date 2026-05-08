import { expect, test, type Page } from '@playwright/test';

const desktopStateKey = 'mills.desktop.v1';
const flagsStateKey = 'mills.flags.v1';
const wallpaperStateKey = 'mills.wallpaper.v1';

async function suppressBoot(page: Page): Promise<void> {
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
	});
}

function windowFor(page: Page, id: string) {
	return page.locator(`.window[data-window-id="${id}"]`);
}

test.describe('desktop shell tracer bullets', () => {
	test.beforeEach(async ({ page }) => {
		await suppressBoot(page);
	});

	test('opens, maximizes, hides, and reopens a window from the launcher', async ({ page }) => {
		await page.goto('/');

		const aboutWindow = windowFor(page, 'about');
		await page.locator('[data-open-window="about"]').first().click();
		await expect(aboutWindow).toBeVisible();
		await expect(page.locator('.taskbar-item', { hasText: 'about.exe' })).toBeVisible();

		await aboutWindow.getByRole('button', { name: 'maximize' }).click();
		await expect(aboutWindow).toHaveClass(/window--maximized/);
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), desktopStateKey))
			.toContain('"kind":"maximized"');

		await aboutWindow.getByRole('button', { name: 'hide' }).click();
		await expect(aboutWindow).toBeHidden();
		await expect(page.locator('.taskbar-item', { hasText: 'about.exe' })).toHaveCount(0);

		await page.locator('[data-open-window="about"]').first().click();
		await expect(aboutWindow).toBeVisible();
	});

	test('command palette reveals and captures hidden flag after flags are unlocked', async ({ page }) => {
		await page.addInitScript((key) => {
			localStorage.setItem(key, JSON.stringify({ console: Date.now() }));
		}, flagsStateKey);
		await page.goto('/');

		await page.keyboard.press('Control+K');
		const palette = page.getByRole('dialog', { name: 'command palette' });
		await expect(palette).toBeVisible();

		await page.getByRole('textbox', { name: 'search apps' }).fill('hack');
		await expect(page.locator('.cmdp__item', { hasText: 'reveal hidden flag' })).toBeVisible();

		await page.keyboard.press('Enter');
		await expect(page.getByRole('textbox', { name: 'search apps' })).toHaveValue(
			'flag{command_k_to_rule_them_all}',
		);
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), flagsStateKey))
			.toContain('"palette"');
	});
});

test.describe('high-value app tracer bullets', () => {
	test.beforeEach(async ({ page }) => {
		await suppressBoot(page);
	});

	test('terminal command renders output in the DOM', async ({ page }) => {
		await page.goto('/terminal/');

		const terminalWindow = windowFor(page, 'terminal');
		await expect(terminalWindow).toBeVisible();
		await terminalWindow.getByRole('textbox', { name: 'terminal input' }).fill('echo e2e-terminal-smoke');
		await terminalWindow.getByRole('textbox', { name: 'terminal input' }).press('Enter');

		await expect(terminalWindow.getByText('e2e-terminal-smoke', { exact: true })).toBeVisible();
	});

	test('display wallpaper choice persists across reload', async ({ page }) => {
		await page.goto('/display/');

		const displayWindow = windowFor(page, 'display');
		await expect(displayWindow).toBeVisible();
		await displayWindow.getByRole('button', { name: 'set wallpaper: arizona iced tea' }).click();
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), wallpaperStateKey))
			.toBe('arizona');

		await page.reload();
		const reloadedDisplayWindow = windowFor(page, 'display');
		await expect(reloadedDisplayWindow).toBeVisible();
		await expect(
			reloadedDisplayWindow.getByRole('button', { name: 'set wallpaper: arizona iced tea' }),
		).toHaveAttribute('aria-pressed', 'true');
	});
});
