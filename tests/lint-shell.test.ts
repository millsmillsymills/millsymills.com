import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'shell-lint-'));
	mkdirSync(join(root, 'scripts/analytics'), { recursive: true });
	mkdirSync(join(root, 'bin'));
	copyFileSync('scripts/lint-shell.sh', join(root, 'scripts/lint-shell.sh'));
	for (const name of ['assert-new.sh', 'verify-live.sh', 'smoke-new.sh', 'analytics/run.sh', 'analytics/lint-queries.sh']) {
		// Running any input would fail: the gate must only inspect these files.
		writeFileSync(join(root, 'scripts', name), 'exit 99\n');
	}
	for (const tool of ['shellcheck', 'shfmt']) {
		writeFileSync(join(root, 'bin', tool), `#!/bin/bash\nprintf '%s\\n' "$@" > "$LINT_ROOT/${tool}.args"\nexit "\${${tool.toUpperCase()}_STATUS:-0}"\n`, { mode: 0o755 });
	}
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function run(extra = {}) {
	return spawnSync('/bin/bash', [join(root, 'scripts/lint-shell.sh')], {
		cwd: tmpdir(), encoding: 'utf8',
		env: { ...process.env, PATH: `${root}/bin:/usr/bin:/bin`, LINT_ROOT: root, ...extra },
	});
}
it('includes newly added assertions and verifiers without executing them, from any cwd', () => {
	expect(run().status).toBe(0);
	for (const tool of ['shellcheck', 'shfmt']) {
		const args = readFileSync(join(root, `${tool}.args`), 'utf8');
		for (const file of ['assert-new.sh', 'verify-live.sh', 'smoke-new.sh', 'analytics/run.sh', 'analytics/lint-queries.sh', 'lint-shell.sh']) {
			expect(args.split('\n')).toContain(`scripts/${file}`);
		}
	}
});
it('fails when shellcheck rejects an input', () => {
	expect(run({ SHELLCHECK_STATUS: '17' }).status).toBe(17);
});
it('fails when shfmt rejects an input', () => {
	expect(run({ SHFMT_STATUS: '18' }).status).toBe(18);
});
