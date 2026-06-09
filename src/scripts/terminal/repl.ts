/*
 * Terminal REPL: input handling, history, autocomplete, render.
 *
 * Tied to a single terminal DOM root. Commands are dispatched through
 * the registry and write output via the Context.out callback.
 */

import { lookup, listCommands, type Context } from './registry';
import { buildFs } from './filesystem';

interface Options {
	root: HTMLElement;
	onExit?: () => void;
}

export function bootTerminal({ root, onExit }: Options): void {
	const output = root.querySelector<HTMLDivElement>('.term__output');
	const inputLine = root.querySelector<HTMLDivElement>('.term__input-line');
	const input = root.querySelector<HTMLInputElement>('.term__input');
	const promptEl = root.querySelector<HTMLSpanElement>('.term__prompt');
	if (!output || !inputLine || !input || !promptEl) return;

	const fs = buildFs();
	let cwd = '/home/mills';
	const history: string[] = [];
	let histIdx = -1;
	let pendingResolve: ((v: string | null) => void) | null = null;
	let pendingMask = false;
	// Serialise execute() against itself. Two Enter presses in rapid
	// succession would otherwise let a second `execute()` start while
	// the first is still awaiting a `prompt()`, and both would race on
	// the single `pendingResolve`/`pendingMask` closure.
	let isExecuting = false;

	function writeLine(text: string, cls = ''): void {
		const el = document.createElement('div');
		el.className = 'term__line' + (cls ? ' ' + cls : '');
		el.textContent = text;
		output!.appendChild(el);
		output!.scrollTop = output!.scrollHeight;
	}

	function clear(): void {
		output!.replaceChildren();
	}

	function setPrompt(text: string): void {
		promptEl!.textContent = text;
	}

	function refreshPrompt(): void {
		const home = cwd === '/home/mills' ? '~' : cwd.replace(/^\/home\/mills/, '~');
		setPrompt(`mills@millsymills:${home}$ `);
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((r) => setTimeout(r, ms));
	}

	const ctx: Context = {
		args: [],
		out: writeLine,
		cwd,
		setCwd: (next) => {
			cwd = next;
			refreshPrompt();
		},
		fs,
		prompt: (label, mask = false) => {
			pendingMask = mask;
			setPrompt(label);
			input!.type = mask ? 'password' : 'text';
			return new Promise<string | null>((r) => {
				pendingResolve = r;
			});
		},
		clear,
		exit: () => onExit?.(),
		history: () => [...history],
		sleep,
	};

	async function execute(line: string): Promise<void> {
		const trimmed = line.trim();
		if (!trimmed) return;
		if (isExecuting) return;
		isExecuting = true;
		try {
			await runCommand(trimmed);
		} finally {
			isExecuting = false;
		}
	}

	async function runCommand(trimmed: string): Promise<void> {
		// U+00A0 (non-breaking space) is included alongside \s because
		// mobile keyboards sometimes insert NBSP after autocorrect, and
		// JavaScript regex \s coverage of NBSP is engine-dependent.
		const parts = trimmed.split(/[\s\u00a0]+/);
		const name = parts[0];
		const args = parts.slice(1);
		const cmd = lookup(name);
		if (!cmd) {
			writeLine(`zsh: command not found: ${name}`, 't-err');
			writeLine(`type 'help' for available commands.`, 't-dim');
			return;
		}
		// rebuild ctx each invocation so cwd setter sees latest closure
		const localCtx: Context = { ...ctx, args, get cwd() { return cwd; }, fs };
		try {
			await cmd.handler(localCtx);
		} catch (err) {
			// Cleanup must not swallow the error message — a throw inside
			// refreshPrompt would otherwise unwind the stack before writeLine
			// fires, leaving the user with a broken REPL and no diagnostic.
			try {
				if (pendingResolve) {
					const r = pendingResolve;
					pendingResolve = null;
					pendingMask = false;
					if (input) input.type = 'text';
					refreshPrompt();
					r(null);
				}
			} catch (cleanupErr) {
				console.error('[mills.terminal] prompt-state cleanup failed', cleanupErr);
			}
			const message = err instanceof Error ? err.message : String(err);
			writeLine(`error: ${message}`, 't-err');
		}
	}

	function tabComplete(): void {
		const value = input!.value;
		if (!value || value.includes(' ')) return; // only complete the command word for now
		const matches = listCommands().filter((c) => c.name.startsWith(value));
		if (matches.length === 1) {
			input!.value = matches[0].name + ' ';
		} else if (matches.length > 1) {
			writeLine(matches.map((m) => m.name).join('  '), 't-dim');
		}
	}

	function onKey(e: KeyboardEvent): void {
		if (pendingResolve) {
			if (e.key === 'Enter') {
				e.preventDefault();
				const v = input!.value;
				const r = pendingResolve;
				pendingResolve = null;
				input!.value = '';
				input!.type = 'text';
				if (!pendingMask) writeLine(promptEl!.textContent + v);
				else writeLine(promptEl!.textContent);
				refreshPrompt();
				r(v);
			} else if (e.key === 'c' && e.ctrlKey) {
				e.preventDefault();
				const r = pendingResolve;
				pendingResolve = null;
				input!.value = '';
				input!.type = 'text';
				writeLine('^C', 't-dim');
				refreshPrompt();
				// Resolve with null so callers can distinguish Ctrl-C from
				// an empty Enter (which feeds '' into things like sudo's
				// 3-strike password check).
				r(null);
			}
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const line = input!.value;
			input!.value = '';
			writeLine(promptEl!.textContent + line);
			if (line.trim()) history.push(line);
			histIdx = history.length;
			void execute(line);
			return;
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (histIdx > 0) histIdx -= 1;
			input!.value = history[histIdx] ?? '';
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (histIdx < history.length - 1) {
				histIdx += 1;
				input!.value = history[histIdx];
			} else {
				histIdx = history.length;
				input!.value = '';
			}
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			tabComplete();
			return;
		}

		if (e.key === 'l' && e.ctrlKey) {
			e.preventDefault();
			clear();
			return;
		}

		if (e.key === 'c' && e.ctrlKey) {
			e.preventDefault();
			writeLine(promptEl!.textContent + input!.value + '^C', 't-dim');
			input!.value = '';
		}
	}

	input.addEventListener('keydown', onKey);
	root.addEventListener('click', () => input!.focus());

	// boot banner
	writeLine('millsOS terminal v0.1', 't-dim');
	writeLine("type 'help' to start.", 't-dim');
	writeLine('');
	refreshPrompt();
}
