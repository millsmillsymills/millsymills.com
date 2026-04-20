import { register } from '../registry';
import { projects, findProject, mcpProjects } from '../../../data/projects';

register({
	name: 'mcp',
	summary: 'list / describe / install MCP servers mills maintains',
	usage: 'mcp [list | describe <id> | install <id>]',
	handler: ({ args, out }) => {
		const sub = args[0] ?? 'list';

		if (sub === 'list') {
			const list = mcpProjects();
			out('available MCP servers:', 't-dim');
			out('');
			list.forEach((p) => {
				out(`  ${p.id.padEnd(12)} ${p.tagline}`);
			});
			out('');
			out('run `mcp describe <id>` for more, or `mcp install <id>` for setup.', 't-dim');
			return;
		}

		if (sub === 'describe') {
			const id = args[1];
			if (!id) return out('usage: mcp describe <id>', 't-err');
			const p = findProject(id);
			if (!p) return out(`mcp: no such project: ${id}`, 't-err');
			out(`${p.name} — ${p.tagline}`, 't-ok');
			out('');
			out(p.description);
			out('');
			out(`tags:  ${p.tags.join(', ')}`, 't-dim');
			out(`repo:  ${p.repo}`, 't-dim');
			if (p.install) out(`install: ${p.install}`, 't-dim');
			return;
		}

		if (sub === 'install') {
			const id = args[1];
			if (!id) return out('usage: mcp install <id>', 't-err');
			const p = findProject(id);
			if (!p) return out(`mcp: no such project: ${id}`, 't-err');
			if (!p.install) {
				out(`${p.name} isn't an MCP server. source: ${p.repo}`, 't-err');
				return;
			}
			out(`# install ${p.name}`, 't-dim');
			out(`$ ${p.install}`, 't-ok');
			out('');
			out('then restart your MCP client. or for a one-shot smoke test:', 't-dim');
			out(`$ curl -s http://<host>/ | jq '.tools'`, 't-dim');
			return;
		}

		if (sub === 'repos') {
			projects.forEach((p) => out(`${p.name.padEnd(22)} ${p.repo}`));
			return;
		}

		out(`mcp: unknown subcommand "${sub}". try: list, describe, install, repos`, 't-err');
	},
});
