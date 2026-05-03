import { describe, expect, it } from 'vitest';
import { _resolvePath } from './basic';
import { lookup } from '../registry';
import { buildFs, type Entry } from '../filesystem';
import type { Context } from '../registry';

// Importing basic.ts registers its commands. The single shared registry
// means lookup('cat') etc. return the real handlers.
import './basic';

interface MockState {
	out: string[];
	classes: string[];
	cwd: string;
	cleared: number;
	exited: number;
}

function mockContext(args: string[], cwd = '/home/mills'): { ctx: Context; state: MockState } {
	const fs: Record<string, Entry> = buildFs();
	const state: MockState = { out: [], classes: [], cwd, cleared: 0, exited: 0 };
	const ctx: Context = {
		args,
		out: (line, cls) => {
			state.out.push(line);
			state.classes.push(cls ?? '');
		},
		get cwd() {
			return state.cwd;
		},
		setCwd: (next) => {
			state.cwd = next;
		},
		fs,
		prompt: async () => null,
		clear: () => {
			state.cleared += 1;
		},
		exit: () => {
			state.exited += 1;
		},
		history: () => [],
		sleep: async () => {},
	};
	return { ctx, state };
}

describe('_resolvePath', () => {
	it('returns /home/mills for "~", "~/", and undefined target', () => {
		expect(_resolvePath('/anywhere', '~')).toBe('/home/mills');
		expect(_resolvePath('/anywhere', '~/')).toBe('/home/mills');
		expect(_resolvePath('/anywhere', undefined)).toBe('/home/mills');
	});

	it('expands "~/foo" to /home/mills/foo', () => {
		expect(_resolvePath('/anywhere', '~/projects')).toBe('/home/mills/projects');
	});

	it('treats absolute targets as absolute, ignoring cwd', () => {
		expect(_resolvePath('/home/mills', '/etc')).toBe('/etc');
	});

	it('joins relative targets onto cwd', () => {
		expect(_resolvePath('/home/mills', 'projects')).toBe('/home/mills/projects');
	});

	it('handles "cd .." from "/" by clamping at root', () => {
		expect(_resolvePath('/', '..')).toBe('/');
	});

	it('handles "cd ../.." past root by clamping at root', () => {
		expect(_resolvePath('/', '../..')).toBe('/');
		expect(_resolvePath('/home', '../..')).toBe('/');
	});

	it('collapses "foo/../bar" segments inline', () => {
		expect(_resolvePath('/home/mills', 'foo/../bar')).toBe('/home/mills/bar');
	});

	it('strips trailing slash on cwd before joining', () => {
		expect(_resolvePath('/home/mills/', 'projects')).toBe('/home/mills/projects');
	});

	it('skips empty segments and "." segments', () => {
		expect(_resolvePath('/home/mills', './a/./b/./')).toBe('/home/mills/a/b');
	});

	it('returns "/" when every segment is consumed by parents', () => {
		expect(_resolvePath('/home/mills', '../..')).toBe('/');
	});
});

describe('cd command', () => {
	it('mutates cwd to the resolved path', () => {
		const cd = lookup('cd');
		expect(cd).toBeDefined();
		const { ctx, state } = mockContext(['/etc']);
		cd!.handler(ctx);
		expect(state.cwd).toBe('/etc');
		expect(state.out.length).toBe(0);
	});

	it('rejects cd into a non-existent path', () => {
		const cd = lookup('cd')!;
		const { ctx, state } = mockContext(['/does-not-exist']);
		cd.handler(ctx);
		expect(state.cwd).toBe('/home/mills');
		expect(state.out[0]).toMatch(/no such directory/);
		expect(state.classes[0]).toBe('t-err');
	});

	it('rejects cd into a file (not a directory)', () => {
		const cd = lookup('cd')!;
		const { ctx, state } = mockContext(['/etc/passwd'], '/');
		cd.handler(ctx);
		expect(state.cwd).toBe('/');
		expect(state.out[0]).toMatch(/not a directory/);
	});
});

describe('ls command', () => {
	it('lists top-level children of /', () => {
		const ls = lookup('ls')!;
		const { ctx, state } = mockContext(['/']);
		ls.handler(ctx);
		expect(state.out).toContain('home/');
		expect(state.out).toContain('etc/');
	});

	it('errors on missing path', () => {
		const ls = lookup('ls')!;
		const { ctx, state } = mockContext(['/nope']);
		ls.handler(ctx);
		expect(state.out[0]).toMatch(/no such path/);
		expect(state.classes[0]).toBe('t-err');
	});
});

describe('cat command', () => {
	it('returns "permission denied" on /etc/shadow (priv enforcement)', () => {
		const cat = lookup('cat')!;
		const { ctx, state } = mockContext(['/etc/shadow']);
		cat.handler(ctx);
		expect(state.out[0]).toMatch(/permission denied/);
		expect(state.classes[0]).toBe('t-err');
	});

	it('prints content of a non-priv file (/etc/passwd)', () => {
		const cat = lookup('cat')!;
		const { ctx, state } = mockContext(['/etc/passwd']);
		cat.handler(ctx);
		expect(state.classes[0]).toBe('');
		expect(state.out.length).toBeGreaterThan(0);
	});

	it('errors on a missing path', () => {
		const cat = lookup('cat')!;
		const { ctx, state } = mockContext(['/etc/nope']);
		cat.handler(ctx);
		expect(state.out[0]).toMatch(/no such file/);
	});

	it('errors on a directory', () => {
		const cat = lookup('cat')!;
		const { ctx, state } = mockContext(['/etc']);
		cat.handler(ctx);
		expect(state.out[0]).toMatch(/is a directory/);
	});

	it('shows usage when called with no args', () => {
		const cat = lookup('cat')!;
		const { ctx, state } = mockContext([]);
		cat.handler(ctx);
		expect(state.out[0]).toMatch(/usage: cat/);
	});
});
