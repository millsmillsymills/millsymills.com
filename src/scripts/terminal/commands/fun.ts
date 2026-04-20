import { register, lookup } from '../registry';
import { sha256, captureById } from '../../flags';

// SHA-256 of the canonical sudo password. Don't put the literal in the bundle.
// Generated locally:
//   echo -n password | shasum -a 256
// gives 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
const SUDO_PASS_DIGEST = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

register(
	{
		name: 'sudo',
		summary: 'execute a command as root',
		usage: 'sudo <cmd> [args...]',
		handler: async (ctx) => {
			const { args, out, prompt } = ctx;
			if (!args.length) return out('usage: sudo <cmd> [args...]', 't-err');

			out('We trust you have received the usual lecture from the local System');
			out('Administrator. It usually boils down to these three things:');
			out('');
			out('    #1) Respect the privacy of others.');
			out('    #2) Think before you type.');
			out('    #3) With great power comes great responsibility.');
			out('');

			let attempts = 0;
			while (attempts < 3) {
				const pw = await prompt(`[sudo] password for mills: `, true);
				if (pw === null) return; // ctrl-c
				const digest = await sha256(pw);
				if (digest === SUDO_PASS_DIGEST) {
					out('');
					captureById('sudo'); // direct capture; the digest verification happened above
					// re-run the wrapped command with priv elevation: temporarily clear `priv`
					const sub = args[0];
					const cmd = lookup(sub);
					if (!cmd) {
						out(`sudo: ${sub}: command not found`, 't-err');
						return;
					}
					const restoredFs = ctx.fs;
					const elevated: typeof ctx.fs = {};
					for (const [k, v] of Object.entries(restoredFs)) elevated[k] = { ...v, priv: false };
					await cmd.handler({ ...ctx, args: args.slice(1), fs: elevated });
					return;
				}
				attempts += 1;
				if (attempts < 3) out('Sorry, try again.', 't-err');
			}
			out('sudo: 3 incorrect password attempts', 't-err');
		},
	},
	{
		name: 'fortune',
		summary: 'print a random fortune',
		handler: ({ out }) => {
			const fortunes = [
				'security is a feeling.',
				'the s in IoT stands for security.',
				'never roll your own crypto. except when you have to.',
				'patch tuesday, exploit wednesday.',
				'sudo make me a sandwich.',
				'in the depths of every devops engineer beats the heart of a sysadmin.',
				'there is no cloud — only other people\'s computers.',
				'the only secure computer is one that is unplugged. and even then, audit the firmware.',
				'every line of yaml is a bug waiting to happen.',
				'turn it off and on again actually works most of the time.',
			];
			out(fortunes[Math.floor(Math.random() * fortunes.length)]);
		},
	},
	{
		name: 'cowsay',
		summary: 'a cow says something',
		usage: 'cowsay <text>',
		handler: ({ args, out }) => {
			const text = args.join(' ') || 'moo';
			const len = text.length;
			out(' ' + '_'.repeat(len + 2));
			out('< ' + text + ' >');
			out(' ' + '-'.repeat(len + 2));
			out('        \\   ^__^');
			out('         \\  (oo)\\_______');
			out('            (__)\\       )\\/\\');
			out('                ||----w |');
			out('                ||     ||');
		},
	},
	{
		name: 'rm',
		summary: 'remove files (joke)',
		hidden: true,
		handler: ({ args, out }) => {
			if (args[0] === '-rf' && (args[1] === '/' || args[1] === '/*')) {
				out('rm: refusing to recursively delete root. nice try.', 't-err');
				return;
			}
			out(`rm: this is a static site. nothing to delete.`, 't-dim');
		},
	},
	{
		name: 'sl',
		summary: '🚂',
		hidden: true,
		handler: ({ out }) => {
			out('      ====        ________                ___________');
			out('  _D _|  |_______/        \\__I_I_____===__|_________|');
			out('   |(_)---  |   H\\________/ |   |        =|___ ___|');
			out('   /     |  |   H  |  |     |   |         ||_| |_||');
			out('  |      |  |   H  |__--------------------| [___] |');
			out('  | ________|___H__/__|_____/[][]~\\_______|       |');
			out('  |/ |   |-----------I_____I [][] []  D   |=======|__');
		},
	},
	{
		name: 'uname',
		summary: 'system information',
		handler: ({ args, out }) => {
			if (args[0] === '-a') {
				out('millsOS millsymills 6.6.42-pinkpilled #1 SMP PREEMPT_DYNAMIC web GNU/Linux');
			} else {
				out('millsOS');
			}
		},
	},
);
