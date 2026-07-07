import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(repoRoot, 'scripts/assert-no-stray-inline-scripts.mjs');

// The guard reads `dist` and `infra/cloudfront.tf` relative to its cwd, so
// each case runs the real script against a throwaway fixture tree rather than
// the repo's own dist/. This exercises the actual exit-code + message contract
// CI depends on; only the filesystem boundary (the fixture dirs) is faked.
function runGuard(cwd: string): { status: number; output: string } {
	try {
		const stdout = execFileSync('node', [guard], { cwd, encoding: 'utf8' });
		return { status: 0, output: stdout };
	} catch (err) {
		const e = err as { status?: number; stdout?: string; stderr?: string };
		return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
}

describe('assert-no-stray-inline-scripts guard', () => {
	let fixture: string;

	beforeEach(() => {
		fixture = mkdtempSync(join(tmpdir(), 'inline-scripts-guard-'));
		mkdirSync(join(fixture, 'infra'), { recursive: true });
		writeFileSync(
			join(fixture, 'infra/cloudfront.tf'),
			"content_security_policy = \"default-src 'self'; script-src 'self'\"\n",
		);
	});

	afterEach(() => {
		rmSync(fixture, { recursive: true, force: true });
	});

	it('exits 1 with a build-blind message when dist/ is empty', () => {
		mkdirSync(join(fixture, 'dist'));
		const { status, output } = runGuard(fixture);
		expect(status).toBe(1);
		expect(output).toContain('no HTML files in dist/');
	});

	it('exits 0 when dist/ has clean HTML with no inline scripts', () => {
		mkdirSync(join(fixture, 'dist'));
		writeFileSync(
			join(fixture, 'dist/index.html'),
			'<!doctype html><html><head><script src="/_astro/app.js"></script></head><body></body></html>',
		);
		const { status, output } = runGuard(fixture);
		expect(status).toBe(0);
		expect(output).toContain('no executable inline script');
	});

	it('exits 1 with a stray-script message when dist/ ships an unallowlisted inline script', () => {
		mkdirSync(join(fixture, 'dist'));
		writeFileSync(
			join(fixture, 'dist/index.html'),
			'<!doctype html><html><body><script>window.boom = 1;</script></body></html>',
		);
		const { status, output } = runGuard(fixture);
		expect(status).toBe(1);
		expect(output).toContain('stray inline');
	});

	it('exits 1 with a clean message when dist/ is missing', () => {
		const { status, output } = runGuard(fixture);
		expect(status).toBe(1);
		expect(output).toContain('dist/ not found');
		expect(output).toContain('npm run build');
	});

	it('exits 1 with a not-a-directory message when dist is a file', () => {
		writeFileSync(join(fixture, 'dist'), '');
		const { status, output } = runGuard(fixture);
		expect(status).toBe(1);
		expect(output).toContain('dist/ is not a directory');
	});
});
