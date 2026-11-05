import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

const LOCAL = 'scripts/ci-local.sh';
const WORKFLOW = '.github/workflows/ci.yml';
// One entry per exemption, with a comment explaining why it cannot run in CI.
const ALLOWLIST = new Set();

// This is an inventory of the repository's line-oriented command convention,
// not a shell interpreter. Support direct ./scripts calls and node calls,
// optionally preceded by env and literal shell assignments (including quotes).
const assignment = String.raw`[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s'";]*)`;
const invocation = new RegExp(
	String.raw`^\s*(?:env\s+)?(?:${assignment}\s+)*(?:\./|node\s+)(scripts/assert-[a-z0-9-]+\.(?:sh|mjs))(?=\s|$)`,
);

function invocations(lines) {
	return new Set(lines.flatMap((line) => {
		const match = invocation.exec(line);
		return match ? [match[1]] : [];
	}));
}

// Parse YAML before selecting commands: folded scalars are shell text after
// folding, and run-shaped content in metadata is never an executable step.
function runLines(source) {
	const document = parseDocument(source);
	if (document.errors.length) {
		throw new Error(`${WORKFLOW}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
	}
	const workflow = document.toJS();
	const jobs = workflow?.jobs;
	if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) {
		throw new Error(`${WORKFLOW}: expected a jobs mapping`);
	}
	return Object.values(jobs).flatMap((job) => {
		if (!Array.isArray(job?.steps)) return [];
		return job.steps.flatMap((step) => typeof step?.run === 'string' ? step.run.split('\n') : []);
	});
}

try {
	const local = invocations(readFileSync(LOCAL, 'utf8').split('\n'));
	if (!local.size) throw new Error(`extracted zero assert invocations from ${LOCAL} — check the command syntax`);
	const hosted = invocations(runLines(readFileSync(WORKFLOW, 'utf8')));
	const missing = [...local].filter((script) => !ALLOWLIST.has(script) && !hosted.has(script));
	if (missing.length) {
		throw new Error(missing.map((script) => `${script} runs in ${LOCAL} but has no active run step in ${WORKFLOW}`).join('\n'));
	}
	console.log(`✓ all ${local.size} assert scripts in ${LOCAL} are mirrored in ${WORKFLOW}`);
} catch (error) {
	console.error(`✗ ${error.message}`);
	process.exitCode = 1;
}
