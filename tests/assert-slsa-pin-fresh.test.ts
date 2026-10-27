import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guard = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../scripts/assert-slsa-pin-fresh.sh'), 'utf8');
const prefix = 'slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@';

function check(workflow: string) {
	const fixture = mkdtempSync(join(tmpdir(), 'slsa-pin-'));
	try {
		spawnSync('git', ['init', '--quiet', fixture]);
		mkdirSync(join(fixture, '.github/workflows'), { recursive: true });
		writeFileSync(join(fixture, '.github/workflows/deploy.yml'), workflow);
		return spawnSync('bash', ['-c', guard], {
			cwd: fixture,
			encoding: 'utf8',
			env: { ...process.env, MMS_CHECK_SLSA_UPSTREAM: 'false' },
		});
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
}

describe('SLSA runtime compatibility guard', () => {
	it('accepts the pin proven to work on Node 24 and retains the upstream warning', () => {
		const result = check(`uses: ${prefix}v2.1.0\n`);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('verified compatible with Node 24');
		expect(result.stdout).toContain('WARN: upstream still declares Node-20 actions');
	});

	for (const version of ['v2.0.0', 'v99.0.0']) {
		it(`rejects unreviewed version ${version}`, () => {
			const result = check(`uses: ${prefix}${version}\n`);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain('has not been reviewed');
		});
	}

	it('rejects a missing or non-versioned pin', () => {
		for (const workflow of ['', `uses: ${prefix}main\n`]) {
			const result = check(workflow);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain('could not locate');
		}
	});

	it('rejects ambiguous version pins', () => {
		const result = check(`uses: ${prefix}v2.1.0\nuses: ${prefix}v99.0.0\n`);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('expected exactly 1');
	});
});
