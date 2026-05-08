import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		setupFiles: ['./vitest.setup.ts'],
		alias: {
			// `@aws-sdk/client-s3` is part of the Lambda runtime, not a
			// project dependency. Alias to a stub so vitest can resolve
			// `infra/csp_report.mjs`; tests override the stub via
			// `vi.mock` per test file.
			'@aws-sdk/client-s3': fileURLToPath(
				new URL('./tests/stubs/aws-sdk-client-s3.ts', import.meta.url),
			),
		},
	},
});
