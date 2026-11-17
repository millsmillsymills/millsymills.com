import { expect, test } from '@playwright/test';

test('standalone simulation disclosure is visible on desktop and narrow screens', async ({ page }) => {
 for (const width of [1280, 390]) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/apps/unifi-demo/index.html');
  const notice = page.locator('.simulation-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Write toggles affect local simulation state only');
  const bounds = await notice.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
 }
});

test('rendered projects show stdio setup and no invented homelab endpoints', async ({ page }) => {
 await page.goto('/projects/');
 const projects = page.locator('.window[data-window-id="projects"]');
 await expect(projects).toBeVisible();
 await expect(projects).toContainText('UNRAID_API_KEY="<api-key>"');
 await expect(projects).toContainText('UNIFI_NETWORK_API="<network-key>"');
 await expect(projects).toContainText('claude mcp add protonmail -- protonmail-mcp');
 await expect(projects).not.toContainText(':8765');
 await expect(projects).not.toContainText(':8766');
 await expect(projects).toContainText('scripted browser simulation');
});
