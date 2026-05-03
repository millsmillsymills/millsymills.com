import { describe, expect, it } from 'vitest';
import { HOSTS, SELF_IP, SUBNET, findHost } from './network';
import { lookup, type Context } from './registry';
import { buildFs, type Entry } from './filesystem';

import './commands/net';

interface MockState {
	out: string[];
	classes: string[];
}

function mockContext(args: string[]): { ctx: Context; state: MockState } {
	const fs: Record<string, Entry> = buildFs();
	const state: MockState = { out: [], classes: [] };
	const ctx: Context = {
		args,
		out: (line, cls) => {
			state.out.push(line);
			state.classes.push(cls ?? '');
		},
		cwd: '/home/mills',
		setCwd: () => {},
		fs,
		prompt: async () => null,
		clear: () => {},
		exit: () => {},
		history: () => [],
		// Skip the theatrical sleeps so tests run instantly.
		sleep: async () => {},
	};
	return { ctx, state };
}

describe('findHost', () => {
	it('matches by ip', () => {
		expect(findHost('192.168.1.42')?.name).toBe('lab.local');
	});

	it('matches by full FQDN', () => {
		expect(findHost('lab.local')?.ip).toBe('192.168.1.42');
	});

	it('matches by short name (first label)', () => {
		expect(findHost('lab')?.ip).toBe('192.168.1.42');
	});

	it('matches case-insensitively', () => {
		expect(findHost('LAB.LOCAL')?.ip).toBe('192.168.1.42');
		expect(findHost('Lab')?.ip).toBe('192.168.1.42');
	});

	it('returns undefined for unknown host', () => {
		expect(findHost('nope.local')).toBeUndefined();
	});
});

describe('curl command', () => {
	it('returns the lab.local flag body on http://lab.local/', async () => {
		const curl = lookup('curl')!;
		const { ctx, state } = mockContext(['http://lab.local/']);
		await curl.handler(ctx);
		const joined = state.out.join('\n');
		expect(joined).toContain('welcome to lab.local');
		expect(joined).toContain('flag{lateral_movement_is_my_love_language}');
	});

	it('returns "Connection refused" on a closed port (lab.local:9999)', async () => {
		const curl = lookup('curl')!;
		const { ctx, state } = mockContext(['http://lab.local:9999/']);
		await curl.handler(ctx);
		expect(state.out[0]).toMatch(/Connection refused/);
		expect(state.classes[0]).toBe('t-err');
	});

	it('returns "Could not resolve host" on unknown host', async () => {
		const curl = lookup('curl')!;
		const { ctx, state } = mockContext(['http://nope.local/']);
		await curl.handler(ctx);
		expect(state.out[0]).toMatch(/Could not resolve host/);
		expect(state.classes[0]).toBe('t-err');
	});

	it('rejects malformed URL with "URL rejected"', async () => {
		const curl = lookup('curl')!;
		const { ctx, state } = mockContext(['not-a-url']);
		await curl.handler(ctx);
		expect(state.out[0]).toMatch(/URL rejected/);
		expect(state.classes[0]).toBe('t-err');
	});

	it('shows usage when called with no args', async () => {
		const curl = lookup('curl')!;
		const { ctx, state } = mockContext([]);
		await curl.handler(ctx);
		expect(state.out[0]).toMatch(/usage: curl/);
	});
});

describe('nmap command', () => {
	it('defaults to scanning SUBNET when called with no args', async () => {
		const nmap = lookup('nmap')!;
		const { ctx, state } = mockContext([]);
		await nmap.handler(ctx);
		const joined = state.out.join('\n');
		// Subnet scan reports each host once and does not list ports.
		for (const h of HOSTS) {
			expect(joined).toContain(h.name);
		}
		expect(joined).toContain(`${HOSTS.length} IP addresses`);
	});

	it('lists ports when given a single host', async () => {
		const nmap = lookup('nmap')!;
		const { ctx, state } = mockContext(['lab.local']);
		await nmap.handler(ctx);
		const joined = state.out.join('\n');
		expect(joined).toContain('PORT      STATE SERVICE');
		expect(joined).toContain('80/tcp');
		expect(joined).toContain('1 IP address');
	});

	it('reports failure on unknown host', async () => {
		const nmap = lookup('nmap')!;
		const { ctx, state } = mockContext(['nope.local']);
		await nmap.handler(ctx);
		const errLine = state.out.find((l) => /Failed to resolve/.test(l));
		expect(errLine).toBeDefined();
	});
});

describe('network constants', () => {
	it('SUBNET is the /24 the nmap default expects', () => {
		expect(SUBNET).toBe('192.168.1.0/24');
	});

	it('SELF_IP is reachable via findHost (mills-laptop)', () => {
		expect(findHost(SELF_IP)?.name).toBe('mills-laptop.local');
	});
});
