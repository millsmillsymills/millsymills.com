import { expect, test, type Page } from '@playwright/test';

// Instrument media to test controller integration without codecs or playback.
// These checks establish cleanup/autoplay intent, not real device audio support.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		sessionStorage.setItem('mills.boot.played', '1');
		localStorage.setItem('mills.welcome.seen', '1');
		const bump = (el: HTMLMediaElement, key: string) => {
			el.dataset[key] = String(Number(el.dataset[key] ?? 0) + 1);
		};
		HTMLMediaElement.prototype.play = function () {
			bump(this, 'plays'); this.dispatchEvent(new Event('play')); return Promise.resolve();
		};
		HTMLMediaElement.prototype.pause = function () {
			bump(this, 'pauses'); this.dispatchEvent(new Event('pause'));
		};
		HTMLMediaElement.prototype.load = function () { bump(this, 'loads'); };
	});
	await page.route('**/audio/**', (route) => route.fulfill({ status: 204 }));
	page.on('pageerror', (err) => { throw err; });
});
const audio = (page: Page) => page.locator('[data-music-audio]');
const home = (page: Page) => page.locator('.mshell__home');
async function mobile(page: Page, path = '/') {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(path);
}
async function launch(page: Page, id: string) {
	await home(page).locator(`[data-open-app="${id}"]`).click();
}
async function cleaned(page: Page) {
	await expect(audio(page)).not.toHaveAttribute('src');
	await expect(audio(page)).toHaveAttribute('data-pauses', '1');
	await expect(audio(page)).toHaveAttribute('data-loads', '1');
}

test('mobile gesture opens Music; home cleans it and reopening starts fresh', async ({ page }) => {
	await mobile(page);
	await launch(page, 'music');
	await expect(audio(page)).toHaveAttribute('data-plays', '1');
	await expect(audio(page)).toHaveAttribute('src', /track-/);
	await page.getByRole('button', { name: 'back to home' }).click();
	await cleaned(page);
	await launch(page, 'music');
	await expect(audio(page)).toHaveAttribute('data-plays', '2');
});

test('mobile history and external close clean up, while repeated selection does not restart', async ({ page }) => {
	await mobile(page);
	await launch(page, 'music');
	await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-open-app="music"]')!.click());
	await expect(audio(page)).toHaveAttribute('data-plays', '1');
	await page.goBack(); // repeated selection still selected Music
	await expect(audio(page)).toHaveAttribute('src', /track-/);
	await page.goBack(); // initial home
	await cleaned(page);
	await page.goForward(); // popstate is not a play gesture
	await expect(page.locator('[data-mobile-app="music"]')).toBeVisible();
	await expect(audio(page)).toHaveAttribute('data-plays', '1');
	await expect(audio(page)).not.toHaveAttribute('src');
	await page.locator('[data-music-play]').click();
	await expect(audio(page)).toHaveAttribute('data-plays', '2');
	await page.evaluate(() => document.dispatchEvent(new CustomEvent('mills:close-window', { detail: { id: 'music' } })));
	await expect(home(page)).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('src');
	await expect(audio(page)).toHaveAttribute('data-pauses', '2');
});

test('mobile deep link and persisted desktop Music never autoplay hidden resources', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('mills.desktop.v1', JSON.stringify({ open: ['music'], windows: {} })));
	await mobile(page);
	await expect(home(page)).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('data-plays');
	await expect(audio(page)).not.toHaveAttribute('src');
	await page.goto('/music/');
	await expect(page.locator('[data-mobile-app="music"]')).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('data-plays');
});

test('breakpoint handoff retains active Music DOM and playback, then home cleans it', async ({ page }) => {
	await mobile(page);
	await launch(page, 'music');
	await audio(page).evaluate((el) => el.setAttribute('data-identity', 'same'));
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(page.locator('.window[data-window-id="music"]')).toBeVisible();
	await expect(audio(page)).toHaveAttribute('data-identity', 'same');
	await expect(audio(page)).toHaveAttribute('data-plays', '1');
	await expect(audio(page)).not.toHaveAttribute('data-pauses');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('[data-mobile-app="music"]')).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('data-pauses');
	await page.getByRole('button', { name: 'back to home' }).click();
	await cleaned(page);
});

test('desktop focus keeps Music active; hide and mobile home release it', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/');
	await page.locator('[data-open-window="music"]').first().click();
	await page.locator('[data-open-window="about"]').first().click();
	await expect(audio(page)).toHaveAttribute('data-plays', '1');
	await expect(audio(page)).not.toHaveAttribute('data-pauses');
	await page.locator('.taskbar-item', { hasText: 'vaporplayer' }).click();
	await page.locator('.window[data-window-id="music"] .window-control--hide').click();
	await cleaned(page);
	await page.locator('.window[data-window-id="about"] .window-control--close').click();
	await page.locator('[data-open-window="music"]').first().click();
	await expect(audio(page)).toHaveAttribute('data-plays', '2');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(home(page)).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('src');
	await expect(audio(page)).toHaveAttribute('data-pauses', '2');
});

for (const width of [390, 1280]) {
	for (const direct of [false, true]) {
		test(`lazy apps initialize once at width ${width}, direct=${direct}`, async ({ page }) => {
			let frames = 0;
			let tls = 0;
			await page.route('**/apps/unifi-demo/index.html', (route) => {
				frames++; return route.fulfill({ contentType: 'text/html', body: '<p>local fixture</p>' });
			});
			await page.route('**/api/tls/inspect', (route) => {
				tls++; return route.fulfill({ status: 503, body: '{}' });
			});
			await page.setViewportSize({ width, height: 900 });
			const open = async (id: string) => {
				if (width === 390) await launch(page, id);
				else await page.locator(`[data-open-window="${id}"]`).first().click();
			};
			const close = async (id: string) => {
				if (width === 390) await page.getByRole('button', { name: 'back to home' }).click();
				else await page.locator(`.window[data-window-id="${id}"] .window-control--close`).click();
			};
			await page.goto(direct ? '/unifi/' : '/');
			if (!direct) await open('unifi');
			await expect.poll(() => frames).toBe(1);
			await close('unifi'); await open('unifi');
			await expect(page.locator('.unifi-demo__frame')).toHaveAttribute('src', '/apps/unifi-demo/index.html');
			expect(frames).toBe(1);
			await close('unifi');
			if (direct) await page.goto('/inspector/');
			else await open('inspector');
			await expect.poll(() => tls).toBe(1);
			await close('inspector'); await open('inspector');
			await page.locator('[data-inspector-refresh]').click();
			await expect.poll(() => tls).toBe(2);
		});
	}
}

test('mobile home releases a manually started deep-linked track', async ({ page }) => {
	await mobile(page, '/music/');
	await page.locator('[data-music-play]').click();
	await expect(audio(page)).toHaveAttribute('src', /track-/);
	await page.getByRole('button', { name: 'back to home' }).click();
	await cleaned(page);
	await expect(page.locator('.winamp__track--current')).toHaveCount(0);
});

test('desktop restored Music does not autoplay and close releases manually started audio', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('mills.desktop.v1', JSON.stringify({ open: ['music'], windows: {} })));
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/');
	await expect(page.locator('.window[data-window-id="music"]')).toBeVisible();
	await expect(audio(page)).not.toHaveAttribute('data-plays');
	await page.locator('[data-music-play]').click();
	await page.locator('.window[data-window-id="music"] .window-control--close').click();
	await cleaned(page);
});
