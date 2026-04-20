import { register } from '../registry';
import { submitFlag, getCaptured, challenges } from '../../flags';

register({
	name: 'flag',
	summary: 'CTF: submit / status / hints',
	usage: 'flag [submit <flag{...}> | status | hints [<id>]]',
	handler: async ({ args, out }) => {
		const sub = args[0] ?? 'status';

		if (sub === 'submit') {
			const value = args.slice(1).join(' ');
			if (!value) return out('usage: flag submit <flag{...}>', 't-err');
			const result = await submitFlag(value);
			out(result.message, result.ok && !result.already ? 't-ok' : '');
			return;
		}

		if (sub === 'status') {
			const captured = getCaptured();
			const total = challenges.length;
			const got = Object.keys(captured).length;
			out(`captured ${got} / ${total}`, 't-ok');
			out('');
			challenges.forEach((c) => {
				const mark = captured[c.id] ? '✓' : ' ';
				const cls = captured[c.id] ? 't-ok' : 't-dim';
				out(`  [${mark}] ${c.id.padEnd(14)} ${c.difficulty.padEnd(7)} ${c.title}`, cls);
			});
			return;
		}

		if (sub === 'hints') {
			const id = args[1];
			const list = id ? challenges.filter((c) => c.id === id) : challenges;
			if (!list.length) return out(`no challenge: ${id}`, 't-err');
			list.forEach((c) => {
				out(`${c.id} (${c.difficulty}) — ${c.title}`, 't-ok');
				out('  ' + c.hint);
				out('');
			});
			return;
		}

		out(`flag: unknown subcommand "${sub}". try: submit, status, hints`, 't-err');
	},
});
