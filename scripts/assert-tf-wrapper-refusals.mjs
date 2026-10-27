#!/usr/bin/env node
// Exercise the real wrapper in disposable git repositories, never this
// checkout's Terraform directory. Optional arguments select named cases.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cases = new Map([
	['invalid-stack', { args: ['definitely-not-a-stack', 'plan'], status: 2,
		text: 'refusing: stack must be one of [millsymills], got definitely-not-a-stack' }],
	['missing-init', { args: ['millsymills', 'plan'], status: 3,
		text: 'refusing: infra/.terraform/.stack missing; run `./scripts/tf.sh millsymills init` first' }],
	['wrong-stack', { args: ['millsymills', 'plan'], marker: 'stale-stack', status: 4,
		text: 'refusing: infra/.terraform initialized for stack stale-stack, this command targets millsymills.' }],
	['wrong-stack-unlock', { args: ['millsymills', 'force-unlock', 'fake-id'], marker: 'stale-stack', status: 4,
		text: 'refusing: infra/.terraform initialized for stack stale-stack, this command targets millsymills.' }],
]);

function check(name) {
	const scenario = cases.get(name);
	const fixture = mkdtempSync(join(tmpdir(), 'tf-wrapper-refusal-'));
	try {
		const env = { ...process.env };
		// Inherited git overrides must not redirect root discovery to a real checkout.
		for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
		const init = spawnSync('git', ['init', '--quiet', fixture], { env, encoding: 'utf8', timeout: 5000 });
		if (init.error || init.signal || init.status !== 0) {
			throw new Error(`${name}: fixture git init failed: ${init.error ?? init.signal ?? init.status}\n${init.stderr}`);
		}
		mkdirSync(join(fixture, 'scripts'));
		mkdirSync(join(fixture, 'infra/.terraform'), { recursive: true });
		mkdirSync(join(fixture, 'bin'));
		copyFileSync(join(root, 'scripts/tf.sh'), join(fixture, 'scripts/tf.sh'));
		if (scenario.marker) writeFileSync(join(fixture, 'infra/.terraform/.stack'), `${scenario.marker}\n`);
		const callLog = join(fixture, 'terraform-called');
		writeFileSync(join(fixture, 'bin/terraform'), '#!/bin/sh\nprintf "called\\n" >> "$TF_REFUSAL_CALL_LOG"\nexit 97\n', { mode: 0o755 });
		const result = spawnSync('bash', [join(fixture, 'scripts/tf.sh'), ...scenario.args], {
			cwd: fixture,
			env: { ...env, PATH: `${join(fixture, 'bin')}:${env.PATH ?? ''}`, TF_REFUSAL_CALL_LOG: callLog },
			encoding: 'utf8',
			timeout: 5000,
		});
		const stderr = (result.stderr ?? '').replace(/\u001b\[[0-9;]*m/g, '');
		const called = existsSync(callLog);
		if (result.error || result.signal || result.status !== scenario.status || !stderr.includes(scenario.text) || called) {
			throw new Error(`${name}: expected exit ${scenario.status} and stderr containing ${JSON.stringify(scenario.text)}; ` +
				`actual exit ${result.status}, signal ${result.signal}, error ${result.error ?? 'none'}, Terraform invoked: ${called}\n` +
				`stdout:\n${result.stdout ?? ''}\nstderr:\n${stderr}`);
		}
		console.log(`✓ ${name}: exit ${scenario.status}, expected refusal, Terraform never invoked`);
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
}

try {
	const selected = process.argv.slice(2);
	for (const name of selected) {
		if (!cases.has(name)) throw new Error(`unknown refusal case ${JSON.stringify(name)}; choose ${[...cases.keys()].join(', ')}`);
	}
	for (const name of selected.length ? selected : cases.keys()) check(name);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
