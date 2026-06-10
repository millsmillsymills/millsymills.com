import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The CloudFront Functions runtime is constrained ES5.1 with no module
// system, so `infra/cloudfront_function_index.js` defines a bare global
// `handler` rather than exporting it. Load the source and eval it into a
// callable to exercise the same code that ships to the edge.
const source = readFileSync(
	resolve(process.cwd(), 'infra/cloudfront_function_index.js'),
	'utf8',
);
// eslint-disable-next-line no-new-func
const handler = new Function(`${source}\nreturn handler;`)() as (event: {
	request: { uri: string };
}) => { uri?: string; statusCode?: number; headers?: Record<string, { value: string }> };

const run = (uri: string) => handler({ request: { uri } });

describe('cloudfront viewer-request function', () => {
	describe('framed deep-link redirect (#653)', () => {
		it('302-redirects the bare /apps/unifi-demo path to /unifi/', () => {
			const res = run('/apps/unifi-demo');
			expect(res.statusCode).toBe(302);
			expect(res.headers?.location.value).toBe('/unifi/');
		});

		it('302-redirects the trailing-slash form to /unifi/', () => {
			const res = run('/apps/unifi-demo/');
			expect(res.statusCode).toBe(302);
			expect(res.headers?.location.value).toBe('/unifi/');
		});

		it('does NOT redirect the iframe-source index.html (loop gotcha)', () => {
			const res = run('/apps/unifi-demo/index.html');
			expect(res.statusCode).toBeUndefined();
			expect(res.uri).toBe('/apps/unifi-demo/index.html');
		});
	});

	describe('canary robots tripwire (#141, #723)', () => {
		it('logs the sentinel for the lowercase bait path', () => {
			const logs: string[] = [];
			const original = console.log;
			console.log = (msg: string) => logs.push(msg);
			try {
				run('/admin/backup/db.sql');
			} finally {
				console.log = original;
			}
			expect(logs.some((m) => m.startsWith('CANARY_TRIPWIRE'))).toBe(true);
		});

		it('logs the sentinel for mixed-case probes (case-insensitive)', () => {
			const logs: string[] = [];
			const original = console.log;
			console.log = (msg: string) => logs.push(msg);
			try {
				run('/Admin/Backup');
				run('/ADMIN/BACKUP/');
			} finally {
				console.log = original;
			}
			expect(logs.filter((m) => m.startsWith('CANARY_TRIPWIRE')).length).toBe(2);
		});

		it('does not log the sentinel for unrelated paths', () => {
			const logs: string[] = [];
			const original = console.log;
			console.log = (msg: string) => logs.push(msg);
			try {
				run('/security/');
			} finally {
				console.log = original;
			}
			expect(logs.some((m) => m.startsWith('CANARY_TRIPWIRE'))).toBe(false);
		});
	});

	describe('directory index rewrite (existing behavior)', () => {
		it('appends index.html to a trailing-slash directory uri', () => {
			expect(run('/security/').uri).toBe('/security/index.html');
		});

		it('rewrites the root to index.html', () => {
			expect(run('/').uri).toBe('/index.html');
		});

		it('appends /index.html to an extensionless route', () => {
			expect(run('/unifi').uri).toBe('/unifi/index.html');
		});

		it('leaves a real file uri untouched', () => {
			expect(run('/favicon.ico').uri).toBe('/favicon.ico');
		});
	});
});
