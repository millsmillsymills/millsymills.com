import { expect, test } from '@playwright/test';
import { apps } from '../../src/data/apps';

// Hidden apps still answer at `/<id>/` for direct hits, but /og/<id>.png
// is intentionally not generated for them (see src/pages/og/[app].png.ts:
// `apps.filter((a) => !a.hidden)`). Deep-link tests cover every app for
// the page-load assertions, but the OG-image assertions only run on the
// non-hidden subset.
const DEEP_LINKS = apps.map((app) => ({
	id: app.id,
	title: app.title,
	hidden: app.hidden ?? false,
}));

const VISIBLE_LINKS = DEEP_LINKS.filter((l) => !l.hidden);

test.describe('per-app deep links', () => {
	for (const link of DEEP_LINKS) {
		test(`/${link.id}/ opens the corresponding window`, async ({ page }) => {
			await page.goto(`/${link.id}/`);

			// Expected `<title>` shape from src/pages/[app].astro:
			//   `${app.title} — ${profile.handle}`
			await expect(page).toHaveTitle(new RegExp(escapeRegExp(link.title)));

			// Hydrated desktop renders the window for the deep-linked app.
			// `data-window-id` is the canonical hook used across DesktopLayout
			// + Desktop scripts, so it's the assertion-stable surface here.
			const window = page.locator(`.window[data-window-id="${link.id}"]`);
			await expect(window).toBeVisible({ timeout: 10_000 });
		});
	}
});

test.describe('per-app OG images', () => {
	for (const link of VISIBLE_LINKS) {
		test(`/og/${link.id}.png returns 200 image/png`, async ({ request }) => {
			const res = await request.get(`/og/${link.id}.png`);
			expect(res.status(), `${link.id} status`).toBe(200);
			expect(res.headers()['content-type'] ?? '').toMatch(/image\/png/);
		});
	}
});

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
