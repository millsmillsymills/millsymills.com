import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), '../scripts/verify-resume-sync.sh');

describe('resume sync audit', () => {
	let fixture: string;
	let checkout: string;
	let served: string;

	beforeEach(() => {
		fixture = mkdtempSync(join(tmpdir(), 'resume-sync-'));
		checkout = join(fixture, 'career checkout');
		served = join(fixture, 'public/files/resume.md');
		mkdirSync(join(fixture, 'scripts'));
		mkdirSync(join(fixture, 'public/files'), { recursive: true });
		mkdirSync(checkout);
		// The real script locates the served file relative to its own path.
		copyFileSync(script, join(fixture, 'scripts/verify-resume-sync.sh'));
	});

	afterEach(() => rmSync(fixture, { recursive: true, force: true }));

	function run() {
		const result = spawnSync('bash', [join(fixture, 'scripts/verify-resume-sync.sh')], {
			encoding: 'utf8',
			env: { ...process.env, MMS_CAREER_MGMT_DIR: checkout },
		});
		return { status: result.status, output: result.stdout + result.stderr };
	}

	it('names the missing served file before inspecting draft selection', () => {
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('served resume not found at public/files/resume.md');
		expect(result.output).not.toContain('no *Resume*draft*.md');
		expect(result.output).not.toContain('has drifted');
	});

	it('rejects a directory in place of the served file', () => {
		mkdirSync(served);
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('served resume not found');
	});

	it('still rejects missing or ambiguous drafts', () => {
		writeFileSync(served, 'resume\n');
		const missing = run();
		expect(missing.status).toBe(1);
		expect(missing.output).toContain('no *Resume*draft*.md');
		writeFileSync(join(checkout, 'First Resume draft.md'), 'resume\n');
		writeFileSync(join(checkout, 'Second Resume draft.md'), 'resume\n');
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('multiple resume drafts');
	});

	it('passes identical files and rejects content drift', () => {
		writeFileSync(served, 'resume\n');
		writeFileSync(join(checkout, 'Resume draft.md'), 'resume\n');
		expect(run().status).toBe(0);
		writeFileSync(served, 'old resume\n');
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('has drifted');
	});
});
