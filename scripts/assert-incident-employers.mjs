#!/usr/bin/env node
//
// Assert every src/data/incidents.ts entry matches a src/data/profile.ts
// experience entry by `employer`, and that the incident's `year` falls
// within that role's `period` tenure. This is the runtime half of the
// type narrowing in profile.ts (`export type Employer`) — the type
// catches typos in `employer`; this lint catches the harder drift where
// an incident year wanders outside its employer's tenure (e.g.,
// backdating an incident to a year before mills worked there).
//
// What this catches:
//   - new incident whose employer does not match any experience entry
//     (belt-and-suspenders alongside the Employer type narrowing)
//   - new incident whose year is outside the matched role's period
//   - period -> year reshuffle on profile.ts that leaves an old incident
//     stranded outside the new tenure window
//
// What it does NOT catch:
//   - non-numeric/garbage `period` strings on a NEW experience entry —
//     the start/end parser fails closed (refuses unparseable periods)
//     but only when an incident actually references that employer
//   - month-level precision: tenure is parsed at year granularity, which
//     matches how `period` is written ('2017 – 2022', '2023 – present')
//
// Run anytime — no build artifact required. Wired into ci-local.sh.
//
// Also asserts the resume.md `### Title · Company · Period · Location`
// role headers match profile.ts exactly. Both files are hand-maintained
// in lock-step today; drift between them would silently misrepresent
// employment history on the public resume.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const PROFILE_TS = resolve(ROOT, 'src/data/profile.ts');
const INCIDENTS_TS = resolve(ROOT, 'src/data/incidents.ts');
const RESUME_MD = resolve(ROOT, 'public/files/resume.md');

const RED = '\x1b[1;31m';
const GREEN = '\x1b[1;32m';
const RESET = '\x1b[0m';

function fail(msg) {
	process.stderr.write(`${RED}✗ ${msg}${RESET}\n`);
}
function ok(msg) {
	process.stdout.write(`${GREEN}✓ ${msg}${RESET}\n`);
}

// Parse profile.ts `experience` array. The shape has been stable since
// the file was introduced; a real TS parser would be sturdier but a
// regex pass keeps this lint dep-free (matches the assert-og-image-per-app
// pattern). Each entry is an object literal containing `title:`,
// `company:`, `period:`, `location:` string fields followed by a
// `bullets:` array — we capture the four fields and ignore the rest.
function parseExperience(src) {
	const start = src.indexOf('export const experience = [');
	if (start === -1) throw new Error('profile.ts: experience literal not found');
	const end = src.indexOf('] as const;', start);
	if (end === -1) throw new Error('profile.ts: end of experience literal not found');
	const body = src.slice(start, end);

	const out = [];
	const entryRe = /\{\s*title:\s*'([^']+)',\s*company:\s*'([^']+)',\s*period:\s*'([^']+)',\s*location:\s*'([^']+)',/g;
	for (const m of body.matchAll(entryRe)) {
		out.push({ title: m[1], company: m[2], period: m[3], location: m[4] });
	}
	if (out.length === 0) throw new Error('profile.ts: no experience entries parsed');
	// Cross-check against a field count so an entry whose shape drifts
	// from entryRe (reordered fields, an inserted field) cannot silently
	// drop out of validation while the others keep passing.
	const declared = (body.match(/\bcompany:\s*'/g) ?? []).length;
	if (out.length !== declared) {
		throw new Error(
			`profile.ts: parsed ${out.length} experience entries but found ${declared} company: fields — an entry's shape drifted from the parser`,
		);
	}
	return out;
}

// Parse incidents.ts `incidents` array — just the (year, employer) pairs
// and a 1-based source line number so failures point at the actual entry.
function parseIncidents(src) {
	const start = src.indexOf('export const incidents:');
	if (start === -1) throw new Error('incidents.ts: incidents literal not found');
	const end = src.indexOf('];', start);
	if (end === -1) throw new Error('incidents.ts: end of incidents literal not found');
	const body = src.slice(start, end);

	const out = [];
	const re = /year:\s*(\d{4}),\s*severity:\s*'[^']+',\s*employer:\s*'([^']+)'/g;
	for (const m of body.matchAll(re)) {
		const line = src.slice(0, start + m.index).split('\n').length;
		out.push({ year: Number(m[1]), employer: m[2], line });
	}
	if (out.length === 0) throw new Error('incidents.ts: no incident entries parsed');
	// Same cross-check as parseExperience: every incident carries exactly
	// one employer: field, so a count mismatch means an entry's field
	// order/shape drifted from `re` and was silently skipped.
	const declared = (body.match(/\bemployer:\s*'/g) ?? []).length;
	if (out.length !== declared) {
		throw new Error(
			`incidents.ts: parsed ${out.length} incidents but found ${declared} employer: fields — an entry's shape drifted from the parser`,
		);
	}
	return out;
}

// `'2017 – 2022'` -> [2017, 2022]
// `'2023 – present'` -> [2023, currentYear]
// Accepts en-dash, em-dash, or hyphen-minus separators with optional
// surrounding whitespace. Refuses anything that does not parse to two
// year tokens — fail-closed so a malformed `period` cannot silently
// widen the tenure window to +/-Infinity.
function parsePeriod(period) {
	const sep = /\s*[–—-]\s*/;
	const parts = period.split(sep).map((s) => s.trim());
	if (parts.length !== 2) {
		throw new Error(`unparseable period (not two tokens): '${period}'`);
	}
	const [rawStart, rawEnd] = parts;
	if (!/^\d{4}$/.test(rawStart)) {
		throw new Error(`unparseable period start (not 4-digit year): '${period}'`);
	}
	const start = Number(rawStart);
	const isPresent = rawEnd === 'present';
	if (!isPresent && !/^\d{4}$/.test(rawEnd)) {
		throw new Error(`unparseable period end (not 4-digit year or 'present'): '${period}'`);
	}
	const end = isPresent ? new Date().getFullYear() : Number(rawEnd);
	if (end < start) {
		throw new Error(`period ends before it starts: '${period}'`);
	}
	return [start, end];
}

// Parse `### <title> · <company> · <period> · <location>` headings from
// resume.md. Role headings are the only `###` lines with four
// middle-dot-separated segments (Selected Projects headings never
// reach four), so the segment count disambiguates; if a future entry
// uses different punctuation it drops out of the parse and the
// role-count check below fails loudly rather than silently
// mis-matching.
function parseResumeRoles(src) {
	const out = [];
	const lines = src.split('\n');
	const re = /^###\s+(.+?)\s+·\s+(.+?)\s+·\s+(.+?)\s+·\s+(.+?)\s*$/;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(re);
		if (m) {
			out.push({
				line: i + 1,
				title: m[1].trim(),
				company: m[2].trim(),
				period: m[3].trim(),
				location: m[4].trim(),
			});
		}
	}
	if (out.length === 0) {
		throw new Error('resume.md: no role headings parsed — did the heading format change? (expected `### Title · Company · Period · Location`)');
	}
	return out;
}

function main() {
	const profileSrc = readFileSync(PROFILE_TS, 'utf8');
	const incidentsSrc = readFileSync(INCIDENTS_TS, 'utf8');
	const resumeSrc = readFileSync(RESUME_MD, 'utf8');

	const experience = parseExperience(profileSrc);
	const incidents = parseIncidents(incidentsSrc);
	const resumeRoles = parseResumeRoles(resumeSrc);

	const byCompany = new Map();
	for (const e of experience) {
		if (byCompany.has(e.company)) {
			throw new Error(
				`profile.ts: duplicate company '${e.company}' — a Map lookup would silently validate incidents against only the later stint's tenure`,
			);
		}
		byCompany.set(e.company, e);
	}

	const violations = [];

	for (const inc of incidents) {
		const role = byCompany.get(inc.employer);
		if (!role) {
			violations.push(
				`src/data/incidents.ts:${inc.line}: employer '${inc.employer}' does not match any profile.ts experience entry (typo? new role? remove from incidents?)`,
			);
			continue;
		}
		let start, end;
		try {
			[start, end] = parsePeriod(role.period);
		} catch (err) {
			violations.push(
				`src/data/profile.ts: ${role.company}: ${err.message} (incident at incidents.ts:${inc.line} depends on this)`,
			);
			continue;
		}
		if (inc.year < start || inc.year > end) {
			violations.push(
				`src/data/incidents.ts:${inc.line}: year ${inc.year} is outside ${role.company}'s tenure (${start}–${end})`,
			);
		}
	}

	if (resumeRoles.length !== experience.length) {
		violations.push(
			`public/files/resume.md: ${resumeRoles.length} role heading(s) but profile.ts has ${experience.length} experience entry(ies) — counts must match`,
		);
	} else {
		for (let i = 0; i < experience.length; i++) {
			const exp = experience[i];
			const res = resumeRoles[i];
			for (const field of ['title', 'company', 'period', 'location']) {
				if (exp[field] !== res[field]) {
					violations.push(
						`public/files/resume.md:${res.line}: ${field} mismatch — resume='${res[field]}', profile.ts='${exp[field]}'`,
					);
				}
			}
		}
	}

	if (violations.length > 0) {
		for (const v of violations) fail(v);
		fail(
			`${violations.length} drift(s) between incidents.ts, profile.ts, and resume.md. Fix the data so all three agree.`,
		);
		process.exit(1);
	}

	ok(
		`incident-employer gate: ${incidents.length} incident(s) in ${experience.length} role tenure(s); resume.md ${resumeRoles.length} heading(s) match profile.ts`,
	);
}

main();
