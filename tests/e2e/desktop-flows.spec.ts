import { expect, test, type Page } from '@playwright/test';

const desktopStateKey = 'mills.desktop.v1';
const wallpaperStateKey = 'mills.wallpaper.v1';

async function suppressBoot(page: Page): Promise<void> {
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
	});
}

function windowFor(page: Page, id: string) {
	return page.locator(`.window[data-window-id="${id}"]`);
}

// Single top-level beforeEach for the whole file:
//   * suppress the boot animation deterministically.
//   * fail any test where the desktop shell silently throws -- without
//     a `pageerror` listener, an uncaught exception during a tracer
//     flow lets the test pass on green selectors despite a real bug.
// The eva boot intro (first visit per context) would otherwise sit over the
// desktop for the video's duration; these specs test post-boot behavior.
test.beforeEach(async ({ page }) => {
	await suppressBoot(page);
	await page.addInitScript(() => localStorage.setItem('mills.intro.seen', '1'));
	page.on('pageerror', (err) => {
		throw new Error(`uncaught page error: ${err.stack ?? err.message}`);
	});
});

// `mills.boot.played` was set in beforeEach. Confirm the boot overlay
// actually got pulled from the DOM rather than just trusting the
// sessionStorage flag -- a regression in `boot.ts` could swallow the
// flag and leave the overlay covering the click target.
async function assertBootSuppressed(page: Page): Promise<void> {
	await expect(page.locator('.boot-overlay')).toHaveCount(0);
}

test.describe('desktop shell tracer bullets', () => {
	test('opens, maximizes, hides, and reopens a window from the launcher', async ({ page }) => {
		await page.goto('/');
		await assertBootSuppressed(page);

		const aboutWindow = windowFor(page, 'about');
		await page.locator('[data-open-window="about"]').first().click();
		await expect(aboutWindow).toBeVisible();
		await expect(page.locator('.taskbar-item', { hasText: 'about' })).toBeVisible();

		await aboutWindow.getByRole('button', { name: 'maximize' }).click();
		await expect(aboutWindow).toHaveClass(/window--maximized/);
		await expect
			.poll(async () => page.evaluate((key) => localStorage.getItem(key), desktopStateKey))
			.toContain('"kind":"maximized"');

		await aboutWindow.getByRole('button', { name: 'hide' }).click();
		await expect(aboutWindow).toBeHidden();
		await expect(page.locator('.taskbar-item', { hasText: 'about' })).toHaveCount(0);

		await page.locator('[data-open-window="about"]').first().click();
		await expect(aboutWindow).toBeVisible();
	});

	test('Ctrl+K is a toggle: second press closes the palette', async ({ page }) => {
		await page.goto('/');

		const palette = page.getByRole('dialog', { name: 'command palette' });
		await page.keyboard.press('Control+K');
		await expect(palette).toBeVisible();

		await page.keyboard.press('Control+K');
		await expect(palette).toBeHidden();
	});

	test('clicking a background window raises it above the previously focused one (z-order)', async ({
		page,
	}) => {
		await page.goto('/');

		const aboutWindow = windowFor(page, 'about');
		const terminalWindow = windowFor(page, 'terminal');

		// Open windows via the bound click handler programmatically --
		// using `.click()` on the launcher icon would have to compete
		// with the already-open `about` window covering the desktop.
		// `HTMLElement.click()` still fires the bound listener but
		// bypasses the pointer-event-interception layer.
		await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>('[data-open-window="about"]');
			if (!el) throw new Error('[data-open-window="about"] launcher missing');
			el.click();
		});
		await expect(aboutWindow).toBeVisible();
		await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>('[data-open-window="terminal"]');
			if (!el) throw new Error('[data-open-window="terminal"] launcher missing');
			el.click();
		});
		await expect(terminalWindow).toBeVisible();

		// terminal opened last -> currently topmost.
		// Read computed z-index, not inline `style.zIndex` -- if the window
		// manager ever stops writing z-index inline (e.g. moves to a CSS
		// class), inline reads silently return '' and `|| '0'` masks the
		// regression with both windows reporting 0.
		const aboutZ = async () =>
			Number(await aboutWindow.evaluate((el) => getComputedStyle(el).zIndex || '0'));
		const terminalZ = async () =>
			Number(await terminalWindow.evaluate((el) => getComputedStyle(el).zIndex || '0'));

		expect(await terminalZ()).toBeGreaterThan(await aboutZ());

		// Click the title bar of `about` to raise it. Use the title
		// bar specifically so we don't compete with inner-body buttons,
		// and because the window-manager binds focus on `pointerdown`
		// of the window subtree (`bindWindows`).
		await aboutWindow.locator('.window__titlebar').first().click();
		await expect.poll(async () => (await aboutZ()) > (await terminalZ())).toBe(true);
	});
});

test.describe('high-value app tracer bullets', () => {
	test('terminal command renders output in the DOM', async ({ page }) => {
		await page.goto('/terminal/');

		const terminalWindow = windowFor(page, 'terminal');
		await expect(terminalWindow).toBeVisible();
		const input = terminalWindow.getByRole('textbox', { name: 'terminal input' });
		await input.fill('echo e2e-terminal-smoke');
		await input.press('Enter');

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

	test('reset-desktop menu item dismisses the start menu and resets aria-expanded', async ({
		page,
	}) => {
		await page.goto('/');
		await assertBootSuppressed(page);

		const start = page.locator('.taskbar__start');
		const menu = page.locator('.start-menu');
		await start.click();
		await expect(menu).toBeVisible();
		await expect(start).toHaveAttribute('aria-expanded', 'true');

		await menu.locator('[data-reset-trigger]').click();

		await expect(page.locator('.reset-confirm')).toBeVisible();
		await expect(menu).toBeHidden();
		await expect(start).toHaveAttribute('aria-expanded', 'false');
	});
});
