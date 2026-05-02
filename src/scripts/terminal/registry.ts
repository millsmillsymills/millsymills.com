/*
 * Command registry shared by every command module.
 *
 * Commands receive the parsed argv plus a Context that lets them write
 * output, mutate cwd, request password input, etc. Output is yielded as
 * line strings; the REPL renders them.
 */

import type { Entry } from './filesystem';

export type WriteFn = (line: string, cls?: string) => void;

export interface Context {
	args: string[];
	out: WriteFn;
	/** mutable cwd */
	cwd: string;
	setCwd: (next: string) => void;
	fs: Record<string, Entry>;
	/**
	 * Ask user for a single line of input (optionally masked, eg. password).
	 * Resolves to the entered string on Enter, or `null` on Ctrl-C OR if the
	 * command throws mid-prompt (the REPL tears down the prompt state and
	 * resolves the awaiter with null so the handler's own `await` returns
	 * cleanly). Callers MUST guard `if (result === null) return;` before
	 * using the value — coercing null into a string would silently produce
	 * a wrong digest check or other undefined behavior.
	 */
	prompt: (label: string, mask?: boolean) => Promise<string | null>;
	/** clear the scrollback */
	clear: () => void;
	/** close the terminal window */
	exit: () => void;
	/** look up a previously-run command (1-based: history(1) is most recent) */
	history: () => string[];
	/** sleep helper for theatrical effects */
	sleep: (ms: number) => Promise<void>;
}

export type Handler = (ctx: Context) => void | Promise<void>;

export interface Command {
	name: string;
	summary: string;
	usage?: string;
	handler: Handler;
	/** if true, hide from `help` listing — still callable */
	hidden?: boolean;
}

const registry = new Map<string, Command>();

export function register(...cmds: Command[]): void {
	for (const c of cmds) registry.set(c.name, c);
}

export function lookup(name: string): Command | undefined {
	return registry.get(name);
}

export function listCommands(includeHidden = false): Command[] {
	return [...registry.values()]
		.filter((c) => includeHidden || !c.hidden)
		.sort((a, b) => a.name.localeCompare(b.name));
}
