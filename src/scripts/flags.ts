/*
 * CTF flag tracker — Juice-Shop-style.
 *
 * Most flags ship only as SHA-256 digests, so view-source-diving the
 * bundle gives you the puzzle, not the answer. A few flags ARE
 * intentionally embedded in source as the puzzle itself — view-source
 * (HTML comment in DesktopLayout), console (console.log banner), garbage
 * (Trash hex dump), base64 (DesktopLayout meta), llms (llms-full.txt),
 * etc/shadow (terminal fake FS), and lab.local (terminal HTTP mock).
 * Captures still route through the same digest-verify path either way.
 *
 * State (captured ids + first-capture timestamps) is persisted in
 * localStorage so progress survives reloads.
 */

const STORAGE_KEY = 'mills.flags.v1';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Challenge {
	id: string;
	title: string;
	hint: string; // gentle nudge; deeper hint via the terminal `flag hints <id>` command
	difficulty: Difficulty;
	digest: string; // SHA-256 of the canonical `flag{...}` string, lowercase hex
	tag?: string; // optional thematic group
}

/* eslint-disable max-len */
// digests below are SHA-256 of the canonical flag strings.
// Generated locally; do not regenerate in CI.
export const challenges: Challenge[] = [
	{
		id: 'view-source',
		title: 'view source, hacker',
		hint: 'somewhere in the HTML, comments are still a thing',
		difficulty: 'easy',
		digest: '7393e24b5a43daed1299e4e2378de94f372e0a512110a35dc93bcf0b8b2d98f2',
	},
	{
		id: 'console',
		title: 'devtools enjoyer',
		hint: 'open devtools and have a look at what we logged for you',
		difficulty: 'easy',
		digest: '21067b4b7ff2bbb7005cb1253cdcb5fd6a83e90670b8ccddcdf1f6d92e53fa07',
	},
	{
		id: 'sudo',
		title: 'mills, the password is...',
		hint: 'a frequent and very common password used by lazy admins',
		difficulty: 'medium',
		digest: 'a9328548fa14b082ed9d8c28578ff5972bcbe3e108e07148dd15d0da8d1faf4a',
	},
	{
		id: 'nmap',
		title: 'who else is on this network',
		hint: 'try scanning the local /24 from the terminal',
		difficulty: 'medium',
		digest: '9232bdf536c8460ad6e1ef8ca165c2b1156a97b80f831a9193b6a4fe2664f567',
	},
	{
		id: 'konami',
		title: '↑↑↓↓←→←→BA',
		hint: 'old school cheat codes still work, even on the modern web',
		difficulty: 'medium',
		digest: 'e2e7689004c5f71b6da1c53d2355c3daf248f0759a19fbb4d7a20d27f82d72d6',
	},
	{
		id: 'garbage',
		title: 'the garbage file',
		hint: 'rent is too damn high. dade. cereal. burn.',
		difficulty: 'easy',
		digest: '7ed8cd3de6664045c6019faa963233411a6a111a56d62434b6599e5a50e38b7e',
		tag: 'hackers',
	},
	{
		id: 'llms',
		title: 'agent-friendly',
		hint: 'agents see a different view of this site. fetch what they see.',
		difficulty: 'easy',
		digest: 'aa8f91574f010b739febae2d81c1b3969fc6f8285d8d46e6f2b626871b74c1d8',
		tag: 'discoverability',
	},
	{
		id: 'robots',
		title: 'please ignore me',
		hint: 'disallowed paths are sometimes an invitation.',
		difficulty: 'medium',
		digest: 'f987ffc2f0ad0547b78ca656ae87b2d199d99cee1f13dc29f42547b4270255ab',
		tag: 'discoverability',
	},
	{
		id: 'palette',
		title: 'command-K for the spirit',
		hint: 'press the power-user shortcut. ask for the thing you should not need to ask for.',
		difficulty: 'medium',
		digest: '5ceddd3df10d3eacac036d599fe4bf10c5bdb34faa7810129d4a197ff5d96834',
	},
	{
		id: 'base64',
		title: 'decoder rings are cool again',
		hint: 'agents read head tags. humans with devtools do too. ZmxhZ3s=...',
		difficulty: 'easy',
		digest: '152e75c2cd7d9b5347368c06fb7a4d7bc18f5a4afc2373a8cb6d1556f5eb266e',
		tag: 'discoverability',
	},
	{
		id: 'clippy',
		title: 'office space',
		hint: 'click vigorously on the helpful one in the corner',
		difficulty: 'easy',
		digest: '7c4472a13cd7a2ab2b8bc08de2a7f294bd45989da767b07149546f04d4c0ea9d',
		tag: 'delight',
	},
];
/* eslint-enable max-len */

export type FlagState = Record<string, number>; // id -> capture epoch ms

function loadState(): FlagState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function saveState(state: FlagState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		/* noop */
	}
}

export function getCaptured(): FlagState {
	return loadState();
}

export async function sha256(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export interface SubmitResult {
	ok: boolean;
	id?: string;
	already?: boolean;
	message: string;
}

export async function submitFlag(input: string): Promise<SubmitResult> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('flag{') || !trimmed.endsWith('}')) {
		return {
			ok: false,
			message: 'expected something shaped like flag{...}, but got something else.',
		};
	}
	const digest = await sha256(trimmed);
	const match = challenges.find((c) => c.digest === digest);
	if (!match) {
		return { ok: false, message: 'wrong flag. or just not a flag i know about.' };
	}
	const state = loadState();
	if (state[match.id]) {
		return {
			ok: true,
			id: match.id,
			already: true,
			message: `already captured "${match.title}". no double-credit, sorry.`,
		};
	}
	state[match.id] = Date.now();
	saveState(state);
	notifyCapture(match);
	return {
		ok: true,
		id: match.id,
		message: `🎉 captured "${match.title}" (${match.difficulty}).`,
	};
}

/**
 * Mark a flag captured by id directly. Used by side-channel triggers (konami,
 * console listeners, etc.) where the user doesn't type the flag string.
 */
export function captureById(id: string): boolean {
	const match = challenges.find((c) => c.id === id);
	if (!match) return false;
	const state = loadState();
	if (state[id]) return false;
	state[id] = Date.now();
	saveState(state);
	notifyCapture(match);
	return true;
}

function notifyCapture(c: Challenge): void {
	const evt = new CustomEvent('mills:flag-captured', { detail: c });
	window.dispatchEvent(evt);
	toast(`flag captured: ${c.title}`);
}

function toast(message: string): void {
	let host = document.querySelector<HTMLDivElement>('.flag-toast-host');
	if (!host) {
		host = document.createElement('div');
		host.className = 'flag-toast-host';
		host.setAttribute('aria-live', 'polite');
		document.body.appendChild(host);
	}
	const el = document.createElement('div');
	el.className = 'flag-toast';
	el.textContent = message;
	host.appendChild(el);
	requestAnimationFrame(() => el.classList.add('flag-toast--in'));
	setTimeout(() => {
		el.classList.remove('flag-toast--in');
		setTimeout(() => el.remove(), 400);
	}, 3500);
}

/**
 * Console banner + flag #2 ("console").
 * The flag literal is here on purpose — the puzzle is "look at console", not "find a string".
 */
export function consoleBanner(): void {
	const big = `
%c
        ┌─────────────────────────────────────┐
        │  mills.exe  ·  v0.1                 │
        │  finder of bugs, breaker of things  │
        │  ──                                 │
        │  if you're reading this, try:       │
        │  >  flag submit flag{console_log_warriors_unite}
        │  in the terminal app on this site.  │
        └─────────────────────────────────────┘
%c
`;
	console.log(
		big,
		'color: #e62b8c; font-family: monospace; font-size: 13px; font-weight: bold;',
		'',
	);
}

/**
 * Konami code listener. Captures the konami flag on the full sequence.
 */
export function konami(): void {
	const sequence = [
		'ArrowUp',
		'ArrowUp',
		'ArrowDown',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'ArrowLeft',
		'ArrowRight',
		'b',
		'a',
	];
	let idx = 0;
	window.addEventListener('keydown', (e) => {
		const expected = sequence[idx];
		const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
		if (got === expected) {
			idx += 1;
			if (idx === sequence.length) {
				idx = 0;
				captureById('konami');
			}
		} else {
			idx = got === sequence[0] ? 1 : 0;
		}
	});
}
