import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
		localStorage.setItem('mills.welcome.seen', '1');
	});
	page.on('pageerror', (err) => {
		throw new Error(`uncaught page error: ${err.stack ?? err.message}`);
	});
});

test('mobile launcher, home button, and browser back select the expected app', async ({ page }) => {
	await page.goto('/');
	const home = page.locator('.mshell__home');
	const app = page.locator('[data-mobile-app="about"]');
	await expect(home).toBeVisible();
	await home.locator('[data-open-app="about"]').click();
	await expect(app).toBeVisible();
	await expect(app).not.toBeEmpty();
	await expect(home).toBeHidden();

	await page.getByRole('button', { name: 'back to home' }).click();
	await expect(home).toBeVisible();
	await expect(app).toBeHidden();
	await page.goBack();
	await expect(app).toBeVisible();
	await page.goBack();
	await expect(home).toBeVisible();
});

test('mobile deep link moves the same app body across the desktop breakpoint and back', async ({ page }) => {
	await page.goto('/about/');
	const mobileApp = page.locator('[data-mobile-app="about"]');
	const desktopBody = page.locator('.window[data-window-id="about"] .window__body');
	await expect(mobileApp).toBeVisible();
	await expect(mobileApp).not.toBeEmpty();
	await expect(desktopBody).toBeEmpty();
	// Track DOM identity as well as content: responsive transitions must move
	// the existing body so form state and bound event handlers survive.
	await mobileApp.evaluate((el) => el.firstElementChild?.setAttribute('data-e2e-moved', '1'));

	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(desktopBody).toBeVisible();
	await expect(desktopBody.locator('[data-e2e-moved]')).toHaveCount(1);
	await expect(mobileApp).toBeEmpty();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(mobileApp).toBeVisible();
	await expect(mobileApp.locator('[data-e2e-moved]')).toHaveCount(1);
	await expect(desktopBody).toBeEmpty();
});
