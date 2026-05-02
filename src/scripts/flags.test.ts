import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	captureById,
	challenges,
	flagsUnlocked,
	getCaptured,
	isChallengeId,
	sha256,
	submitFlag,
	type ChallengeId,
} from './flags';

const STORAGE_KEY = 'mills.flags.v1';

// Canonical flag literals embedded in source. The `id` is the challenge.id
// the literal must hash to. If a future PR rewords a literal in source but
// forgets to regen the digest in `challenges`, this table breaks.
const LITERALS: ReadonlyArray<{ id: ChallengeId; literal: string }> = [
	{ id: 'view-source', literal: 'flag{html_comments_have_no_secrets}' },
	{ id: 'console', literal: 'flag{console_log_warriors_unite}' },
	{ id: 'sudo', literal: 'flag{etc_shadow_should_not_be_world_readable}' },
	{ id: 'nmap', literal: 'flag{lateral_movement_is_my_love_language}' },
	{ id: 'llms', literal: 'flag{read_the_llms_dot_txt}' },
	{ id: 'robots', literal: 'flag{disallowed_is_an_invitation}' },
	{ id: 'palette', literal: 'flag{command_k_to_rule_them_all}' },
	{ id: 'vscode', literal: 'flag{not_an_electron_app}' },
];

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
	document.body.replaceChildren();
	delete document.body.dataset.flagsUnlocked;
});

describe('challenges digest sanity', () => {
	it('every challenge has a 64-char lowercase hex digest', () => {
		for (const c of challenges) {
			expect(c.digest, `${c.id}.digest`).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it('challenge ids are unique', () => {
		const ids = challenges.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it.each(LITERALS)('sha256($literal) matches challenges.find($id).digest', async ({ id, literal }) => {
		const digest = await sha256(literal);
		const match = challenges.find((c) => c.id === id);
		expect(match, `challenges has entry for ${id}`).toBeDefined();
		expect(digest).toBe(match!.digest);
	});
});

describe('isChallengeId', () => {
	it('accepts every real id', () => {
		for (const c of challenges) expect(isChallengeId(c.id)).toBe(true);
	});

	it('rejects falsy and unknown', () => {
		expect(isChallengeId('not-real')).toBe(false);
		expect(isChallengeId('')).toBe(false);
		expect(isChallengeId(undefined)).toBe(false);
		expect(isChallengeId(null)).toBe(false);
	});
});

describe('submitFlag', () => {
	it('rejects malformed input shape with ok=false', async () => {
		for (const bad of ['', 'hello', 'flag{', 'flag}', 'FLAG{abc}', '{abc}']) {
			const res = await submitFlag(bad);
			expect(res.ok, `input=${JSON.stringify(bad)}`).toBe(false);
		}
	});

	it('rejects an unknown but well-shaped flag', async () => {
		const res = await submitFlag('flag{not-a-real-flag-string}');
		expect(res.ok).toBe(false);
	});

	it('accepts a real literal and persists capture', async () => {
		const res = await submitFlag('flag{console_log_warriors_unite}');
		expect(res.ok).toBe(true);
		expect(res.id).toBe('console');
		expect(getCaptured().console).toBeTypeOf('number');
	});

	it('returns already=true on second submission of same flag', async () => {
		await submitFlag('flag{console_log_warriors_unite}');
		const second = await submitFlag('flag{console_log_warriors_unite}');
		expect(second.ok).toBe(true);
		expect(second.already).toBe(true);
	});

	it('trims surrounding whitespace before validating', async () => {
		const res = await submitFlag('   flag{console_log_warriors_unite}\n');
		expect(res.ok).toBe(true);
		expect(res.id).toBe('console');
	});
});

describe('captureById', () => {
	it('returns true on first capture and false on repeat (idempotent)', () => {
		expect(captureById('konami')).toBe(true);
		expect(captureById('konami')).toBe(false);
	});

	it('flips flagsUnlocked() to true after first capture', () => {
		expect(flagsUnlocked()).toBe(false);
		captureById('konami');
		expect(flagsUnlocked()).toBe(true);
	});
});

describe('loadState (via getCaptured)', () => {
	it('returns {} when storage is empty', () => {
		expect(getCaptured()).toEqual({});
	});

	it('returns {} when storage holds invalid JSON', () => {
		localStorage.setItem(STORAGE_KEY, '{not-json');
		expect(getCaptured()).toEqual({});
	});

	it('returns {} when storage holds a non-object', () => {
		localStorage.setItem(STORAGE_KEY, '"just-a-string"');
		expect(getCaptured()).toEqual({});
	});

	it('drops entries with unknown ids', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ console: 1, 'a-flag-that-was-renamed': 2 }),
		);
		const state = getCaptured();
		expect(state.console).toBe(1);
		expect(Object.keys(state)).toEqual(['console']);
	});

	it('drops entries whose timestamp is not a finite number', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ console: 'not-a-number', sudo: Number.NaN, nmap: 1234 }),
		);
		const state = getCaptured();
		expect(state.nmap).toBe(1234);
		expect(state.console).toBeUndefined();
		expect(state.sudo).toBeUndefined();
	});
});
