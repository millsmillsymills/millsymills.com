import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), '../scripts/assert-stack-workflows.mjs');
const workflow = (name = 'production') => `jobs:\n  deploy:\n    environment:\n      name: ${name}\n    steps:\n      - run: echo ok\n`;

describe('shared stack workflow gates', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stack-workflows-'));
		mkdirSync(join(root, 'infra/stacks'), { recursive: true });
		mkdirSync(join(root, '.github/workflows'), { recursive: true });
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));
	function stack(name: string, text = '') { writeFileSync(join(root, `infra/stacks/${name}.tfvars`), text); }
	function deploy(name = 'deploy.yml', text = workflow()) { writeFileSync(join(root, `.github/workflows/${name}`), text); }
	function run(mode = 'all') {
		const result = spawnSync(process.execPath, [script, mode], { cwd: root, encoding: 'utf8' });
		return { status: result.status, output: result.stdout + result.stderr };
	}

	it('passes both modes for explicit settings and matching block environments', () => {
		stack('test', 'deploy_workflow = "custom.yml"\ndeploy_environment = "staging"');
		deploy('custom.yml', workflow('staging'));
		expect(run('workflow-files').status).toBe(0);
		expect(run('workflow-environments').status).toBe(0);
	});
	it('preserves defaults and ignores commented settings, nested data, and secret files', () => {
		stack('test', '# deploy_workflow = "absent.yml"\n/* deploy_environment = "bad" */\nmap = {\n deploy_environment = "irrelevant"\n}\nurl = "https://example.test/#fragment"');
		stack('test.secrets', 'malformed and must never be read');
		deploy();
		expect(run().status).toBe(0);
		expect(run().output).toContain('1 stack(s)');
	});
	it('names the stack and missing referenced workflow', () => {
		stack('test', 'deploy_workflow = "absent.yml"');
		const result = run('workflow-files');
		expect(result.status).toBe(1);
		expect(result.output).toContain('test.tfvars: missing workflow .github/workflows/absent.yml');
	});
	it('keeps file existence independent of environment validation', () => {
		stack('test'); deploy('deploy.yml', 'jobs: {}');
		expect(run('workflow-files').status).toBe(0);
		const result = run('workflow-environments');
		expect(result.status).toBe(1);
		expect(result.output).toContain('deploy.yml: no supported job environment');
	});
	it('checks later stacks and reports both expected and actual environment', () => {
		stack('a'); stack('b', 'deploy_environment = "staging"'); deploy();
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('b.tfvars: deploy_environment=staging');
		expect(result.output).toContain('environment=production');
	});
	it('fails on an empty stack inventory', () => {
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('no non-secret stack tfvars');
	});
	it.each([
		'deploy_workflow = custom.yml',
		'deploy_environment = ""',
		'deploy_environment = var.environment',
		'deploy_environment = "production"\ndeploy_environment = "staging"',
		'deploy_workflow = "../deploy.yml"',
		'deploy_environment = "${var.env}"',
	])('rejects malformed explicit settings without defaulting: %s', (text) => {
		stack('test', text); deploy();
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('test.tfvars');
	});
	it('accepts indented settings and trailing comments', () => {
		stack('test', '  deploy_workflow = "deploy.yml" // default workflow\n deploy_environment = "production" # default env');
		deploy(); expect(run().status).toBe(0);
	});
	it('rejects inconsistent environments across jobs', () => {
		stack('test'); deploy('deploy.yml', workflow() + '  other:\n    environment:\n      name: staging\n');
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('ambiguous job environments: production, staging');
	});
	it.each(['production', '{ name: "${{ vars.ENV }}" }', '{}'])('rejects unsupported environment declarations: %s', (value) => {
		stack('test'); deploy('deploy.yml', `jobs:\n  deploy:\n    environment: ${value}\n`);
		const result = run();
		expect(result.status).toBe(1);
		expect(result.output).toContain('job deploy requires an environment mapping with a literal name');
	});
	it('ignores unrelated metadata and step text that resembles an environment', () => {
		stack('test', 'description = "literal << marker"'); deploy('deploy.yml', workflow() + '  other:\n    env:\n      environment: staging\n    steps:\n      - name: |\n          environment:\n            name: staging\n        run: echo ok\n');
		expect(run().status).toBe(0);
	});
	it('allows multiple jobs with the same literal environment', () => {
		stack('test'); deploy('deploy.yml', workflow() + '  other:\n    environment:\n      name: production\n');
		expect(run().status).toBe(0);
	});
	it('rejects duplicate YAML keys', () => {
		stack('test'); deploy('deploy.yml', workflow() + '    environment:\n      name: staging\n');
		expect(run().output).toContain('invalid YAML');
		expect(run().status).toBe(1);
	});
	it('fails clearly for unreadable stack input and invalid modes', () => {
		mkdirSync(join(root, 'infra/stacks/test.tfvars')); deploy();
		expect(run().status).toBe(1);
		expect(run('typo').output).toContain('unknown mode typo');
	});
});
