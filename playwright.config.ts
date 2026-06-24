import { defineConfig, devices } from '@playwright/test';

// E2E suite: drives real Chromium against the production-shaped build.
// `npm run test:e2e` chains a fresh build via `pretest:e2e`, then this
// config spawns `astro preview` on port 4321 if one isn't already up
// (matches the default astro dev/preview port and mirrors how the site
// is served end-to-end).
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 1 : 0,
	reporter: process.env['CI'] ? 'github' : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4321',
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'npm run preview -- --host 127.0.0.1 --port 4321',
		url: 'http://127.0.0.1:4321',
		reuseExistingServer: !process.env['CI'],
		timeout: 60_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
