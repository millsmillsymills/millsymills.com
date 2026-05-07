import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the repo root (see package.json `test` script), so
// `process.cwd()` is the project root regardless of the test environment.
// Avoid `import.meta.url` here — happy-dom rewrites it to a non-file URL,
// which trips `fileURLToPath`.
const repoRoot = process.cwd();
const srcDir = join(repoRoot, 'src');

// Allow-list of files permitted to use Astro's `set:html` directive.
// `set:html` bypasses Astro's automatic HTML escaping, so every entry here is
// a deliberate exception that must do its own escaping/sanitization.
//
// - DesktopLayout.astro: emits a JSON-LD blob; serialization escapes
//   `<`, `>`, and `&` to unicode escapes so no field can break out of the
//   <script> element.
// - Security.astro: renders a tiny markdown subset via `mdInline()`, which
//   maintains its own scheme allow-list and explicit escape pipeline.
//
// Adding a new entry should be paired with a clear escape/sanitize story
// in the file itself. Anything else is a parser-confusion XSS waiting to ship.
const ALLOWLIST = new Set<string>([
	'src/layouts/DesktopLayout.astro',
	'src/components/desktop/apps/Security.astro',
]);

function walkAstroFiles(dir: string, accumulator: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			walkAstroFiles(fullPath, accumulator);
		} else if (entry.isFile() && entry.name.endsWith('.astro')) {
			accumulator.push(fullPath);
		}
	}
	return accumulator;
}

function toRepoRelative(absolutePath: string): string {
	return relative(repoRoot, absolutePath).split(sep).join('/');
}

describe('set:html usage allow-list', () => {
	it('rejects new `set:html` sinks outside the allow-list', () => {
		const astroFiles = walkAstroFiles(srcDir);
		expect(astroFiles.length).toBeGreaterThan(0);

		const offenders: string[] = [];
		for (const file of astroFiles) {
			const contents = readFileSync(file, 'utf8');
			if (!contents.includes('set:html')) continue;
			const repoRel = toRepoRelative(file);
			if (!ALLOWLIST.has(repoRel)) offenders.push(repoRel);
		}

		expect(
			offenders,
			`set:html bypasses Astro escaping. Add an entry to ALLOWLIST with an ` +
				`escape/sanitize story, or rewrite the call site without set:html.\n` +
				`Offending files:\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	it('keeps the allow-list honest — every listed file actually uses set:html', () => {
		for (const repoRel of ALLOWLIST) {
			const contents = readFileSync(join(repoRoot, repoRel), 'utf8');
			expect(contents, `${repoRel} is on the allow-list but does not use set:html`).toContain(
				'set:html',
			);
		}
	});
});
