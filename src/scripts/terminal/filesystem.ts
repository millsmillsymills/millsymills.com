/*
 * Tiny in-memory fake filesystem for the terminal app.
 *
 * Files are read-only string blobs. Directories are just markers — `ls`
 * lists immediate children, `cat` reads file content, `cd`/`pwd` track
 * a single mutable cwd inside a FakeFs instance.
 */

import { profile, experience, coreSkills } from '../../data/profile';

export interface Entry {
	type: 'file' | 'dir';
	content?: string;
	/** if true, requires sudo to read */
	priv?: boolean;
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

export function buildFs(): Record<string, Entry> {
	return {
		'/': { type: 'dir' },
		'/home': { type: 'dir' },
		'/home/mills': { type: 'dir' },
		'/home/mills/about.txt': { type: 'file', content: aboutTxt },
		'/home/mills/experience.txt': { type: 'file', content: experienceTxt },
		'/home/mills/skills.txt': { type: 'file', content: skillsTxt },
		'/home/mills/resume.md': { type: 'file', content: '(see /files/resume.md served from public/)' },
		'/home/mills/.bashrc': { type: 'file', content: bashrc },
		'/etc': { type: 'dir' },
		'/etc/passwd': { type: 'file', content: passwd },
		'/etc/shadow': { type: 'file', content: shadow, priv: true },
		'/etc/hosts': { type: 'file', content: hosts },
		'/etc/motd': { type: 'file', content: motd },
	};
}
