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

export interface Entry {
	type: 'file' | 'dir';
	content?: string;
	/** if true, requires sudo to read in terminal; hidden from vscode.exe tree */
	priv?: boolean;
	/** optional free-form language hint consumed by vscode.exe's status bar */
	language?: string;
}

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
mills:$6$rounds=656000$abcd$flag{etc_shadow_should_not_be_world_readable}:20089:0:99999:7:::
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

this terminal is a toy. ls / cat / cd / nmap / curl / ssh / sudo / flag — try \`help\`.

real shells exit. this one closes the window.
`);

export const virtualFs: Record<string, Entry> = {
	'/': { type: 'dir' },
	'/home': { type: 'dir' },
	'/home/mills': { type: 'dir' },
	'/home/mills/about.txt': { type: 'file', content: aboutTxt, language: 'text' },
	'/home/mills/experience.txt': { type: 'file', content: experienceTxt, language: 'text' },
	'/home/mills/skills.txt': { type: 'file', content: skillsTxt, language: 'text' },
	'/home/mills/resume.md': { type: 'file', content: '(see /files/resume.md served from public/)', language: 'markdown' },
	'/home/mills/.bashrc': { type: 'file', content: bashrc, language: 'bash' },
	'/home/mills/.zshrc': { type: 'file', content: zshrc, language: 'zsh' },
	'/home/mills/.tmux.conf': { type: 'file', content: tmuxConf, language: 'conf' },
	'/home/mills/.config': { type: 'dir' },
	'/home/mills/.config/nvim': { type: 'dir' },
	'/home/mills/.config/nvim/init.lua': { type: 'file', content: nvimInit, language: 'lua' },
	'/home/mills/.config/git': { type: 'dir' },
	'/home/mills/.config/git/config': { type: 'file', content: gitConfig, language: 'conf' },
	'/home/mills/.dotfiles': { type: 'dir' },
	'/home/mills/.dotfiles/README.md': { type: 'file', content: dotfilesReadme, language: 'markdown' },
	'/home/mills/.dotfiles/CLAUDE.md': { type: 'file', content: claudeMd, language: 'markdown' },
	// Mirrored at the installed path — same bytes, so `cat` in either place works.
	'/home/mills/.claude': { type: 'dir' },
	'/home/mills/.claude/CLAUDE.md': { type: 'file', content: claudeMd, language: 'markdown' },
	'/etc': { type: 'dir' },
	'/etc/passwd': { type: 'file', content: passwd, language: 'text' },
	'/etc/shadow': { type: 'file', content: shadow, priv: true, language: 'text' },
	'/etc/hosts': { type: 'file', content: hosts, language: 'text' },
	'/etc/motd': { type: 'file', content: motd, language: 'text' },
};
