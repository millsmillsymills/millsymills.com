import { register, listCommands, lookup, type Context } from '../registry';
import { incidents } from '../../../data/incidents';

function resolvePath(cwd: string, target: string | undefined): string {
	if (!target || target === '~' || target === '~/') return '/home/mills';
	if (target.startsWith('~/')) return '/home/mills/' + target.slice(2);
	let abs = target.startsWith('/') ? target : cwd.replace(/\/$/, '') + '/' + target;
	const parts: string[] = [];
	for (const seg of abs.split('/')) {
		if (!seg || seg === '.') continue;
		if (seg === '..') parts.pop();
		else parts.push(seg);
	}
	return '/' + parts.join('/');
}

register(
	{
		name: 'help',
		summary: 'list available commands',
		handler: ({ out }) => {
			out('available commands:', 't-dim');
			out('');
			for (const c of listCommands()) {
				out(`  ${c.name.padEnd(12)} ${c.summary}`);
			}
			out('');
			out("type 'man <cmd>' for more on a specific command.", 't-dim');
		},
	},
	{
		name: 'man',
		summary: 'manual for a command',
		usage: 'man <cmd>',
		handler: ({ args, out }) => {
			const target = args[0];
			if (!target) return out('usage: man <cmd>', 't-err');
			const cmd = lookup(target);
			if (!cmd) return out(`no manual entry for ${target}`, 't-err');
			out(`NAME`);
			out(`    ${cmd.name} — ${cmd.summary}`);
			out('');
			out(`USAGE`);
			out(`    ${cmd.usage ?? cmd.name}`);
		},
	},
	{
		name: 'whoami',
		summary: 'print current user',
		handler: ({ out }) => out('mills'),
	},
	{
		name: 'pwd',
		summary: 'print working directory',
		handler: ({ out, cwd }) => out(cwd),
	},
	{
		name: 'cd',
		summary: 'change directory',
		usage: 'cd [path]',
		handler: ({ args, cwd, setCwd, fs, out }) => {
			const target = resolvePath(cwd, args[0]);
			const entry = fs[target];
			if (!entry) return out(`cd: no such directory: ${args[0]}`, 't-err');
			if (entry.type !== 'dir') return out(`cd: not a directory: ${args[0]}`, 't-err');
			setCwd(target);
		},
	},
	{
		name: 'ls',
		summary: 'list directory contents',
		usage: 'ls [path]',
		handler: ({ args, cwd, fs, out }) => {
			const target = resolvePath(cwd, args[0]);
			const prefix = target === '/' ? '/' : target + '/';
			const children: string[] = [];
			for (const path of Object.keys(fs)) {
				if (!path.startsWith(prefix) || path === target) continue;
				const rest = path.slice(prefix.length);
				if (rest.includes('/')) continue;
				children.push(rest + (fs[path].type === 'dir' ? '/' : ''));
			}
			if (!children.length && !fs[target]) return out(`ls: no such path: ${args[0]}`, 't-err');
			children.sort().forEach((c) => out(c, c.endsWith('/') ? 't-dir' : ''));
		},
	},
	{
		name: 'cat',
		summary: 'print file content',
		usage: 'cat <file>',
		handler: ({ args, cwd, fs, out }) => {
			if (!args[0]) return out('usage: cat <file>', 't-err');
			const target = resolvePath(cwd, args[0]);
			const entry = fs[target];
			if (!entry) return out(`cat: ${args[0]}: no such file`, 't-err');
			if (entry.type !== 'file') return out(`cat: ${args[0]}: is a directory`, 't-err');
			if (entry.priv) return out(`cat: ${args[0]}: permission denied`, 't-err');
			(entry.content ?? '').split('\n').forEach((line) => out(line));
		},
	},
	{
		name: 'echo',
		summary: 'print arguments',
		handler: ({ args, out }) => out(args.join(' ')),
	},
	{
		name: 'clear',
		summary: 'clear the screen',
		handler: ({ clear }) => clear(),
	},
	{
		name: 'history',
		summary: 'show command history',
		handler: ({ history, out }) => {
			const h = history();
			h.forEach((cmd, i) => out(`${String(i + 1).padStart(4)}  ${cmd}`));
		},
	},
	{
		name: 'date',
		summary: 'print current date',
		handler: ({ out }) => out(new Date().toString()),
	},
	{
		name: 'exit',
		summary: 'close the terminal window',
		handler: ({ exit }) => exit(),
	},
	{
		name: 'privacy',
		summary: 'print the site\'s privacy posture',
		handler: ({ out }) => {
			out('tl;dr — no tracking, no cookies, no third-party scripts.', 't-dim');
			out('');
			out('  - localStorage + sessionStorage only (window positions, flag progress, boot flag)');
			out('  - CloudFront access logs — 90d retention (ip, ua, url, status, timestamp)');
			out('  - MIT licensed, source on GitHub');
			out('');
			out('full policy:  /privacy/');
		},
	},
	{
		name: 'incidents',
		summary: 'list security incidents and CVEs',
		usage: 'incidents [year]',
		handler: ({ args, out }) => {
			let yearArg: number | null = null;
			if (args[0] !== undefined) {
				const parsed = Number(args[0]);
				if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
					return out(`incidents: invalid year: ${args[0]}`, 't-err');
				}
				yearArg = parsed;
			}
			const filtered = yearArg !== null
				? incidents.filter((i) => i.year === yearArg)
				: incidents;

			if (filtered.length === 0) {
				out(`no incidents${yearArg !== null ? ` in ${yearArg}` : ''}.`, 't-dim');
				return;
			}

			const sevClass: Record<string, string> = {
				critical: 't-err',
				high: 't-err',
				med: 't-dim',
				low: 't-ok',
				info: 't-dim',
			};

			for (const i of filtered) {
				const sev = i.severity.toUpperCase().padEnd(9);
				out(`  ${i.year}  ${sev} ${i.title}`, sevClass[i.severity] ?? '');
			}
			out('');
			out(`  ${filtered.length} incident${filtered.length === 1 ? '' : 's'}${yearArg !== null ? ` in ${yearArg}` : ''}`, 't-dim');
			if (yearArg === null) {
				out('  filter by year:  incidents <year>', 't-dim');
				out('  full wall:  /incidents/', 't-dim');
			}
		},
	},
);

export function _resolvePath(cwd: string, target: string | undefined): string {
	return resolvePath(cwd, target);
}

export type { Context };
