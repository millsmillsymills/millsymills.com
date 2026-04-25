/*
 * Source Control panel for vscode.exe.
 *
 * Renders the last N commits captured at build time (PUBLIC_GIT_LOG —
 * see astro.config.mjs:readGitLog). Each row links to the commit on
 * GitHub. No live data — this is decorative chrome to fill the SCM
 * activity-bar slot, not a working git client.
 */

const REPO_URL = 'https://github.com/millsmillsymills/millsymills.com';

interface Commit {
	hash: string;
	subject: string;
	dateIso: string;
}

/** "5d ago", "2h ago", etc. — short relative time, monospace-friendly. */
function relativeTime(iso: string, now: number = Date.now()): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '?';
	const sec = Math.max(0, Math.floor((now - t) / 1000));
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day}d ago`;
	const mon = Math.floor(day / 30);
	if (mon < 12) return `${mon}mo ago`;
	return `${Math.floor(mon / 12)}y ago`;
}

export function renderSourceControl(container: HTMLElement, commits: ReadonlyArray<Commit>): void {
	container.replaceChildren();

	if (!commits.length) {
		const empty = document.createElement('p');
		empty.className = 'vscode-scm-empty';
		empty.textContent = 'no commit history available.';
		container.appendChild(empty);
		return;
	}

	const heading = document.createElement('div');
	heading.className = 'vscode-sidebar-heading';
	heading.textContent = `LAST ${commits.length} COMMITS`;
	container.appendChild(heading);

	const list = document.createElement('ul');
	list.className = 'vscode-scm-list';
	const now = Date.now();
	for (const c of commits) {
		const li = document.createElement('li');
		li.className = 'vscode-scm-row';

		const link = document.createElement('a');
		link.href = `${REPO_URL}/commit/${c.hash}`;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.className = 'vscode-scm-link';

		const sha = document.createElement('span');
		sha.className = 'vscode-scm-sha';
		sha.textContent = c.hash.slice(0, 7);

		const when = document.createElement('span');
		when.className = 'vscode-scm-when';
		when.textContent = relativeTime(c.dateIso, now);

		const subject = document.createElement('span');
		subject.className = 'vscode-scm-subject';
		subject.textContent = c.subject;

		link.append(sha, when, subject);
		li.appendChild(link);
		list.appendChild(li);
	}
	container.appendChild(list);
}
