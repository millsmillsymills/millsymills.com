import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('CI assert inventory', () => {
	let fixture: string;
	beforeEach(() => {
		fixture = mkdtempSync(join(tmpdir(), 'ci-assert-parity-'));
		mkdirSync(join(fixture, 'scripts/lib'), { recursive: true });
		mkdirSync(join(fixture, '.github/workflows'), { recursive: true });
		for (const file of ['scripts/assert-ci-mirrors-local.sh', 'scripts/lib/check-ci-assert-parity.mjs']) {
			copyFileSync(join(root, file), join(fixture, file));
		}
	});
	afterEach(() => rmSync(fixture, { recursive: true, force: true }));

	function run(local: string, workflow: string) {
		writeFileSync(join(fixture, 'scripts/ci-local.sh'), local);
		writeFileSync(join(fixture, '.github/workflows/ci.yml'), workflow);
		const result = spawnSync('bash', [join(fixture, 'scripts/assert-ci-mirrors-local.sh')], {
			encoding: 'utf8',
		});
		return { status: result.status, output: result.stdout + result.stderr };
	}

	it('accepts active inline and block run commands', () => {
		const result = run('./scripts/assert-a.sh\nnode scripts/assert-b.mjs\n', `jobs:
  check:
    steps:
      - run: ./scripts/assert-a.sh
      - name: Block check
        run: |
          # ignore this comment
          node scripts/assert-b.mjs mode
`);
		expect(result.status).toBe(0);
		expect(result.output).toContain('all 2 assert scripts');
	});

	it.each([
		'# run: ./scripts/assert-a.sh',
		'- name: ./scripts/assert-a.sh\n  run: echo checked',
		'- run: |\n    # ./scripts/assert-a.sh\n    echo checked',
		'- run: echo "./scripts/assert-a.sh"',
		'- run: echo checked # ./scripts/assert-a.sh',
		'- run: echo checked\n  env:\n    EXPECTED: ./scripts/assert-a.sh',
	])('rejects a workflow that only mentions the script: %s', (workflow) => {
		const result = run('./scripts/assert-a.sh', workflow);
		expect(result.status).toBe(1);
		expect(result.output).toContain('scripts/assert-a.sh');
		expect(result.output).toContain('no active run step');
	});

	it.each([
		'MMS_FOO=1 ./scripts/assert-b.sh',
		'MMS_FOO="two words" MMS_BAR= ./scripts/assert-b.sh',
		"env MMS_FOO='two words' node scripts/assert-b.sh",
	])('does not lose env-prefixed local calls: %s', (command) => {
		const local = `./scripts/assert-a.sh\n${command}`;
		const missing = run(local, '- run: ./scripts/assert-a.sh');
		expect(missing.status).toBe(1);
		expect(missing.output).toContain('scripts/assert-b.sh');
		expect(run(local, `- run: ./scripts/assert-a.sh\n- run: ${command}`).status).toBe(0);
	});

	it('accepts quoted YAML commands and ignores local comments and output strings', () => {
		const result = run(
			'# ./scripts/assert-missing.sh\necho "./scripts/assert-other.sh"\n./scripts/assert-a.sh',
			'- run: "./scripts/assert-a.sh" # check\n',
		);
		expect(result.status).toBe(0);
	});

	it('does not consume sibling metadata as part of a run block', () => {
		const result = run('./scripts/assert-a.sh', `- run: |
    echo checked
  name: ./scripts/assert-a.sh
`);
		expect(result.status).toBe(1);
	});

	it('fails clearly when no invocations are extracted', () => {
		const result = run('# no checks\necho done', '- run: echo done');
		expect(result.status).toBe(1);
		expect(result.output).toContain('extracted zero assert invocations');
	});
});
