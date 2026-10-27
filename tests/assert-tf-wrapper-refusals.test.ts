// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrapper = readFileSync(join(root, 'scripts/tf.sh'), 'utf8');

function check(source = wrapper, args: string[] = []) {
	const fixture = mkdtempSync(join(tmpdir(), 'tf-refusal-test-'));
	try {
		mkdirSync(join(fixture, 'scripts'));
		mkdirSync(join(fixture, 'infra/.terraform'), { recursive: true });
		copyFileSync(join(root, 'scripts/assert-tf-wrapper-refusals.mjs'), join(fixture, 'scripts/assert-tf-wrapper-refusals.mjs'));
		writeFileSync(join(fixture, 'scripts/tf.sh'), source);
		// Stand in for a real checkout's initialization: the gate must never
		// inspect, overwrite, or delete this directory while building its fixtures.
		writeFileSync(join(fixture, 'infra/.terraform/.stack'), 'real-stack\n');
		writeFileSync(join(fixture, 'infra/.terraform/sentinel'), 'keep\n');
		const result = spawnSync(process.execPath, [join(fixture, 'scripts/assert-tf-wrapper-refusals.mjs'), ...args], {
			cwd: fixture, encoding: 'utf8', timeout: 15_000,
		});
		expect(readFileSync(join(fixture, 'infra/.terraform/.stack'), 'utf8')).toBe('real-stack\n');
		expect(readFileSync(join(fixture, 'infra/.terraform/sentinel'), 'utf8')).toBe('keep\n');
		expect(existsSync(join(fixture, 'terraform-called'))).toBe(false);
		expect(result.error).toBeUndefined();
		expect(result.signal).toBeNull();
		return result;
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
}

describe('isolated Terraform wrapper refusal gate', () => {
	it('passes all genuine refusals and preserves the source checkout initialization', () => {
		const result = check();
		expect(result.status).toBe(0);
		for (const name of ['invalid-stack', 'missing-init', 'wrong-stack', 'wrong-stack-unlock']) {
			expect(result.stdout).toContain(`✓ ${name}:`);
		}
	});

	it.each(['invalid-stack', 'missing-init', 'wrong-stack', 'wrong-stack-unlock'])(
		'can run only the %s hosted scenario', (name) => {
			const result = check(wrapper, [name]);
			expect(result.status).toBe(0);
			expect(result.stdout.trim().split('\n')).toHaveLength(1);
			expect(result.stdout).toContain(`✓ ${name}:`);
		},
	);

	it.each([1, 127])('rejects unrelated exit %i with captured diagnostics', (code) => {
		const result = check(`echo unrelated-crash >&2\nexit ${code}\n`);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('invalid-stack: expected exit 2');
		expect(result.stderr).toContain(`actual exit ${code}`);
		expect(result.stderr).toContain('unrelated-crash');
	});

	it.each([
		['wrong exit', wrapper.replace('exit 3', 'exit 2')],
		['wrong text', wrapper.replace('missing; run', 'absent; run')],
		['missing text', 'exit 3\n'],
	])('rejects %s even when the other refusal evidence matches', (_name, source) => {
		const result = check(source, ['missing-init']);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('missing-init: expected exit 3');
		expect(result.stderr).toContain('actual exit');
	});

	it('rejects a Terraform call even with the expected code and refusal text', () => {
		const source = wrapper.replace('stale_state_guard() {', 'stale_state_guard() {\n terraform version || true');
		const result = check(source, ['wrong-stack-unlock']);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('actual exit 4');
		expect(result.stderr).toContain('Terraform invoked: true');
	});

	it('rejects a process signal instead of treating a missing exit as refusal', () => {
		const result = check('kill -TERM $$\n');
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('signal SIGTERM');
	});

	it('rejects unknown case names', () => {
		const result = check(wrapper, ['typo']);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('unknown refusal case "typo"');
	});
});
