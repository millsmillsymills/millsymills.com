import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

// Run from the checkout root (or a temporary fixture root in tests).
// This gate reads configuration only; it never initializes Terraform or AWS.
const mode = process.argv[2] ?? 'all';
const modes = ['all', 'workflow-files', 'workflow-environments'];
const defaults = { deploy_workflow: 'deploy.yml', deploy_environment: 'production' };

// Supported tfvars subset: top-level, single-line quoted literal settings.
// Other values may use maps/lists. Ignore comments and nested values; reject
// unsupported heredocs rather than mistake their contents for assignments.
function settings(source, file) {
	const result = { ...defaults };
	const seen = new Set();
	let blockComment = false;
	let depth = 0;
	for (const [index, line] of source.split('\n').entries()) {
		let clean = '';
		let quoted = false;
		let escaped = false;
		let delta = 0;
		let heredoc = false;
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const pair = line.slice(i, i + 2);
			if (blockComment) {
				if (pair === '*/') { blockComment = false; i++; clean += ' '; }
				continue;
			}
			if (!quoted && (char === '#' || pair === '//')) break;
			if (!quoted && pair === '/*') { blockComment = true; i++; continue; }
			if (!quoted && pair === '<<') heredoc = true;
			clean += char;
			if (quoted) {
				if (!escaped && char === '"') quoted = false;
				escaped = !escaped && char === '\\';
			} else if (char === '"') quoted = true;
			else if ('{['.includes(char)) delta++;
			else if ('}]'.includes(char)) delta--;
		}
		const location = `${file}:${index + 1}`;
		if (quoted || heredoc) throw new Error(`${location}: unsupported multiline tfvars value`);
		if (depth === 0) {
			const key = /^\s*(deploy_workflow|deploy_environment)\b/.exec(clean)?.[1];
			if (key) {
				const match = /^\s*(deploy_workflow|deploy_environment)\s*=\s*"([A-Za-z0-9_.-]+)"\s*$/.exec(clean);
				if (!match) throw new Error(`${location}: ${key} must be a single quoted literal setting`);
				if (seen.has(key)) throw new Error(`${location}: duplicate ${key}`);
				seen.add(key);
				result[key] = match[2];
			}
		}
		depth += delta;
		if (depth < 0) throw new Error(`${location}: unbalanced tfvars delimiters`);
	}
	if (blockComment || depth !== 0) throw new Error(`${file}: unterminated comment or value`);
	return result;
}

// Use the already-declared YAML parser and inspect only job environments.
// Require the repository's literal block-style environment.name contract;
// expressions and differing environments across jobs cannot safely pass.
function environments(source, file) {
	const document = parseDocument(source);
	if (document.errors.length) throw new Error(`${file}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
	const jobs = document.toJS()?.jobs;
	if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) throw new Error(`${file}: expected a jobs mapping`);
	const names = [];
	for (const [id, job] of Object.entries(jobs)) {
		if (!job || typeof job !== 'object' || !Object.hasOwn(job, 'environment')) continue;
		const environment = job.environment;
		if (!environment || typeof environment !== 'object' || Array.isArray(environment)
			|| typeof environment.name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(environment.name)) {
			throw new Error(`${file}: job ${id} requires an environment mapping with a literal name`);
		}
		names.push(environment.name);
	}
	if (!names.length) throw new Error(`${file}: no supported job environment declaration`);
	if (new Set(names).size !== 1) throw new Error(`${file}: ambiguous job environments: ${names.join(', ')}`);
	return names[0];
}

try {
	if (!modes.includes(mode)) throw new Error(`unknown mode ${mode}; choose ${modes.join(', ')}`);
	const directory = 'infra/stacks';
	const files = readdirSync(directory).filter((file) => file.endsWith('.tfvars') && !file.endsWith('.secrets.tfvars')).sort();
	if (!files.length) throw new Error(`${directory}: no non-secret stack tfvars files`);
	for (const name of files) {
		const file = join(directory, name);
		const config = settings(readFileSync(file, 'utf8'), file);
		const workflow = join('.github/workflows', config.deploy_workflow);
		if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.ya?ml$/.test(config.deploy_workflow)) throw new Error(`${file}: deploy_workflow must be a workflow filename`);
		let exists = false;
		try { exists = statSync(workflow).isFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
		if (!exists) throw new Error(`${file}: missing workflow ${workflow}`);
		if (mode !== 'workflow-files') {
			const actual = environments(readFileSync(workflow, 'utf8'), workflow);
			if (actual !== config.deploy_environment) throw new Error(`${file}: deploy_environment=${config.deploy_environment} != ${workflow} environment=${actual} (OIDC trust will reject)`);
		}
	}
	console.log(`✓ ${files.length} stack(s) passed ${mode}`);
} catch (error) {
	console.error(`✗ ${error.message}`);
	process.exitCode = 1;
}
