/*
 * Shared fake-filesystem tree.
 *
 * Source of truth for both the terminal app (via src/scripts/terminal/filesystem.ts
 * adapter) and vscode.exe (once #45 ships). Files are read-only string blobs;
 * directories are markers with no content.
 */

import { profile, experience, coreSkills } from './profile';

// Dotfile content — ?raw imports keep the source readable and avoid
// template-literal escaping of ${} / backticks inside shell snippets.
import zshrc from './dotfiles/zshrc.zsh?raw';
import tmuxConf from './dotfiles/tmux.conf?raw';
import nvimInit from './dotfiles/nvim-init.lua?raw';
import gitConfig from './dotfiles/git-config?raw';
import dotfilesReadme from './dotfiles/readme.md?raw';
import claudeMd from './dotfiles/claude-md.md?raw';

export type Language =
	| 'astro'
	| 'bash'
	| 'conf'
	| 'lua'
	| 'markdown'
	| 'text'
	| 'typescript'
	| 'zsh';

export type Entry =
	| { type: 'dir' }
	| {
			type: 'file';
			content: string;
			/** if true, requires sudo to read in terminal; hidden from vscode.exe tree */
			priv?: true;
			/** language hint consumed by vscode.exe's status bar */
			language?: Language;
			/**
			 * Short summary surfaced by the terminal `dotfiles` command.
			 * Setting this field is the inclusion signal — files under
			 * `/home/mills/` with a description appear in the listing,
			 * everything else is hidden from it. Lets us keep e.g.
			 * `.bashrc` (boring stub) and `.claude/CLAUDE.md` (duplicate
			 * mirror of `.dotfiles/CLAUDE.md`) out of the curated index.
			 */
			description?: string;
	  };

const trim = (s: string) => s.replace(/^\n/, '').replace(/\n+$/, '\n');

const aboutTxt = trim(`
${profile.name} (${profile.handle})
${profile.title} @ ${profile.currentEmployer}
${profile.pronouns} | ${profile.location}

${profile.summary}

contact:  ${profile.email}
github:   ${profile.github}
certs:    ${profile.certifications.join(', ')}
`);

const experienceTxt = trim(
	experience
		.map(
			(j) => `
== ${j.title} — ${j.company} (${j.period}) ==
${j.bullets.map((b) => '  - ' + b).join('\n')}
`,
		)
		.join('\n'),
);

const skillsTxt = trim(
	coreSkills.map((g) => `${g.group}:\n  ${g.items.join(', ')}`).join('\n\n'),
);

const bashrc = trim(`
# ~/.bashrc — minimal
export PS1='\\u@\\h:\\w\\$ '
export EDITOR=vim
alias ll='ls -lah'
alias gs='git status'
alias please='sudo $(fc -ln -1)'
`);

const passwd = trim(`
root:x:0:0:root:/root:/bin/bash
mills:x:1000:1000:Andrew Mills:/home/mills:/bin/zsh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`);

const shadow = trim(`
root:!:20089:0:99999:7:::
mills:$6$rounds=656000$abcd$KqJxYz9pN0wXm2vQ7rT4hC8bL1sD6fG3jR5kP0aZ:20089:0:99999:7:::
nobody:*:20089:0:99999:7:::
`);

const hosts = trim(`
127.0.0.1       localhost
::1             localhost
192.168.1.1     gateway.local
192.168.1.10    mills-laptop.local
192.168.1.42    lab.local
192.168.1.100   pihole.local
192.168.1.250   nas.local
`);

const motd = trim(`
welcome to mills@millsymills:~

this terminal is a toy. ls / cat / cd / nmap / curl / ssh / sudo — try \`help\`.

real shells exit. this one closes the window.
`);

// Each entry is frozen so terminal commands (or any other consumer) can't
// mutate the source-of-truth tree by accident. To "modify" an entry, build a
// new one — see sudo's elevated-fs construction in commands/fun.ts.
const entries: Record<string, Entry> = {
	'/': { type: 'dir' },
	'/home': { type: 'dir' },
	'/home/mills': { type: 'dir' },
	'/home/mills/about.txt': { type: 'file', content: aboutTxt, language: 'text' },
	'/home/mills/experience.txt': { type: 'file', content: experienceTxt, language: 'text' },
	'/home/mills/skills.txt': { type: 'file', content: skillsTxt, language: 'text' },
	'/home/mills/resume.md': { type: 'file', content: '(see /files/resume.md served from public/)', language: 'markdown' },
	'/home/mills/.bashrc': { type: 'file', content: bashrc, language: 'bash' },
	'/home/mills/.zshrc': {
		type: 'file',
		content: zshrc,
		language: 'zsh',
		description: 'zsh — starship, atuin, eza/bat/fd/rg, direnv',
	},
	'/home/mills/.tmux.conf': {
		type: 'file',
		content: tmuxConf,
		language: 'conf',
		description: '(stub) — mills does not use tmux',
	},
	'/home/mills/.config': { type: 'dir' },
	'/home/mills/.config/nvim': { type: 'dir' },
	'/home/mills/.config/nvim/init.lua': {
		type: 'file',
		content: nvimInit,
		language: 'lua',
		description: '(stub) — mills does not use nvim; primary editor is vscode',
	},
	'/home/mills/.config/git': { type: 'dir' },
	'/home/mills/.config/git/config': {
		type: 'file',
		content: gitConfig,
		language: 'conf',
		description: 'git — signed commits, autosquash, zdiff3 merges',
	},
	'/home/mills/.dotfiles': { type: 'dir' },
	'/home/mills/.dotfiles/README.md': {
		type: 'file',
		content: dotfilesReadme,
		language: 'markdown',
		description: 'intro + source-of-truth link',
	},
	'/home/mills/.dotfiles/CLAUDE.md': {
		type: 'file',
		content: claudeMd,
		language: 'markdown',
		description: 'claude-code operating contract (plugins, guardrails)',
	},
	// Mirrored at the installed path — same bytes, so `cat` in either place works.
	'/home/mills/.claude': { type: 'dir' },
	'/home/mills/.claude/CLAUDE.md': { type: 'file', content: claudeMd, language: 'markdown' },
	'/etc': { type: 'dir' },
	'/etc/passwd': { type: 'file', content: passwd, language: 'text' },
	'/etc/shadow': { type: 'file', content: shadow, priv: true, language: 'text' },
	'/etc/hosts': { type: 'file', content: hosts, language: 'text' },
	'/etc/motd': { type: 'file', content: motd, language: 'text' },
};

for (const entry of Object.values(entries)) Object.freeze(entry);

export const virtualFs: Readonly<Record<string, Readonly<Entry>>> = Object.freeze(entries);
