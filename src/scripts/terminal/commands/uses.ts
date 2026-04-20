import { register } from '../registry';
import { chimera, gear } from '../../../data/uses';

register(
	{
		name: 'uses',
		summary: 'what mills keeps on the desk (and under it)',
		handler: ({ out }) => {
			gear.forEach((g) => {
				out(`== ${g.title} ==`, 't-ok');
				g.items.forEach((i) => {
					out(`  ${i.name}${i.detail ? ' — ' + i.detail : ''}`);
					if (i.why) out(`    › ${i.why}`, 't-dim');
					if (i.url) out(`    ${i.url}`, 't-dim');
				});
				out('');
			});
			out('for the full server rundown: `chimera`', 't-dim');
		},
	},
	{
		name: 'chimera',
		summary: 'neofetch for the primary unraid box',
		handler: ({ out }) => {
			const art = [
				'    /\\___/\\   ',
				'   ( o   o )  ',
				'    (  =^=  )  ',
				'    (        ) ',
				'     (       )(',
				'      (       )',
				'      /(  |  )\\',
				'      \\       /',
			];
			const maxKey = chimera.specs.reduce((m, s) => Math.max(m, s.k.length), 0);
			const rows = [
				['', `${chimera.name}@unraid`],
				['', '─'.repeat(chimera.name.length + 7)],
				...chimera.specs.map((s) => [s.k, s.v]),
				['', ''],
				['role', chimera.role],
			];
			const h = Math.max(art.length, rows.length);
			for (let i = 0; i < h; i += 1) {
				const left = art[i] ?? '              ';
				const row = rows[i];
				if (row) {
					const [k, v] = row;
					const keyStr = k ? `${k.padEnd(maxKey)} ` : ' '.repeat(maxKey + 1);
					out(`${left}  ${keyStr}${v}`, k === 'role' ? 't-dim' : '');
				} else {
					out(left);
				}
			}
		},
	},
);
