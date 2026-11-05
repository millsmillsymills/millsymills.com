import { readFileSync } from 'node:fs';

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

// Only active run scalars count, never step names, comments, or env values.
// Accept the current workflow's plain/quoted inline commands and block scalars.
// Block contents end when indentation returns to the run key's level.
function runLines(source) {
	const commands = [];
	let blockIndent = null;
	for (const line of source.split('\n')) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const indent = line.length - line.trimStart().length;
		if (blockIndent !== null) {
			if (indent > blockIndent) {
				commands.push(line);
				continue;
			}
			blockIndent = null;
		}
		const match = /^(\s*)(-\s+)?run:\s*(.*)$/.exec(line);
		if (!match) continue;
		const value = match[3].trim();
		if (/^[|>][+-]?(?:\s+#.*)?$/.test(value)) {
			blockIndent = match[1].length + (match[2]?.length ?? 0);
		} else if (value.startsWith('"') || value.startsWith("'")) {
			const quote = value[0];
			const end = value.lastIndexOf(quote);
			if (end > 0 && /^(?:\s*#.*)?$/.test(value.slice(end + 1))) {
				commands.push(value.slice(1, end));
			}
		} else {
			commands.push(value);
		}
	}
	return commands;
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
