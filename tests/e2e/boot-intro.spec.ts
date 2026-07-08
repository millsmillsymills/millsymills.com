import { expect, test } from '@playwright/test';

// First-visit intro: fresh browser context (Playwright default per test) has
// neither mills.intro.seen (localStorage) nor mills.boot.played (session).

test('first visit plays the intro; skip reveals the desktop', async ({ page }) => {
	await page.goto('/');

	const video = page.locator('.boot-overlay__video');
	await expect(video).toBeVisible();

	await page.locator('[data-intro-skip]').click();
	await expect(page.locator('.boot-overlay')).toHaveCount(0);
	await expect(page.locator('#desktop')).toBeVisible();
});

test('second load in the same context skips the video', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-intro-skip]').click();
	await expect(page.locator('.boot-overlay')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('#desktop')).toBeVisible();
	await expect(page.locator('.boot-overlay__video')).toHaveCount(0);
});

test('start menu replays the intro without re-running boot', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-intro-skip]').click();
	await expect(page.locator('#desktop')).toBeVisible();

	// .taskbar__start is the start-menu toggle (same locator used by
	// tests/e2e/desktop-flows.spec.ts's reset-desktop test).
	await page.locator('.taskbar__start').click();
	await page.locator('[data-intro-replay]').click();

	const replay = page.locator('.boot-overlay--replay .boot-overlay__video');
	await expect(replay).toBeVisible();
	await page.locator('[data-intro-skip]').click();
	await expect(page.locator('.boot-overlay--replay')).toHaveCount(0);
});
