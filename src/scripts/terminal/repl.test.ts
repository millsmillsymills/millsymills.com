import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { bootTerminal } from './repl';
import { register, type Command } from './registry';

function mountRoot(): HTMLElement {
	const root = document.createElement('div');
	const output = document.createElement('div');
	output.className = 'term__output';
	const inputLine = document.createElement('div');
	inputLine.className = 'term__input-line';
	const promptEl = document.createElement('span');
	promptEl.className = 'term__prompt';
	const input = document.createElement('input');
	input.className = 'term__input';
	inputLine.appendChild(promptEl);
	inputLine.appendChild(input);
	root.appendChild(output);
	root.appendChild(inputLine);
	document.body.appendChild(root);
	return root;
}

function pressEnter(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

let testCommandCounter = 0;
function uniqueName(prefix: string): string {
	testCommandCounter += 1;
	return `${prefix}_${testCommandCounter}`;
}

describe('repl execute() catch block', () => {
	let root: HTMLElement;

	beforeEach(() => {
		root = mountRoot();
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it('tears down prompt state when a handler throws mid-prompt', async () => {
		const name = uniqueName('thrower');
		const cmd: Command = {
			name,
			summary: 'test command',
			usage: name,
			handler: async (ctx) => {
				// Set up the prompt (which sets pendingResolve + input.type='password'),
				// then throw synchronously inside the async handler. The throw
				// propagates out of the handler as a rejected promise; execute()'s
				// try/catch catches it and the cleanup must reset the prompt state.
				void ctx.prompt('password: ', true);
				throw new Error('boom');
			},
		};
		register(cmd);

		bootTerminal({ root });
		const input = root.querySelector<HTMLInputElement>('.term__input')!;
		expect(input.type).toBe('text'); // baseline

		pressEnter(input, name);

		await new Promise((r) => setTimeout(r, 50));

		// Cleanup must restore input.type to 'text' even though the prompt
		// was masked.
		expect(input.type).toBe('text');
		const errLines = root.querySelectorAll('.term__line.t-err');
		expect(errLines.length).toBeGreaterThan(0);
		expect(errLines[0]!.textContent).toContain('boom');
	});

	it('renders error message even when handler throws a non-Error value', async () => {
		const name = uniqueName('stringthrower');
		const cmd: Command = {
			name,
			summary: 'test command',
			usage: name,
			handler: async () => {
				throw 'plain string';
			},
		};
		register(cmd);

		bootTerminal({ root });
		const input = root.querySelector<HTMLInputElement>('.term__input')!;
		pressEnter(input, name);

		await new Promise((r) => setTimeout(r, 20));

		const errLines = root.querySelectorAll('.term__line.t-err');
		const messages = Array.from(errLines).map((el) => el.textContent ?? '');
		expect(messages.some((m) => m.includes('plain string'))).toBe(true);
	});

	it('catch block resolves the pending prompt awaiter with null', async () => {
		// Locks in the contract documented on Context['prompt']: when a
		// command throws mid-prompt, the awaiter resolves to null so the
		// handler's own `await` returns a sentinel rather than hanging.
		let observedResolution: unknown = 'NOT-RESOLVED';
		const name = uniqueName('promptcontract');
		const cmd: Command = {
			name,
			summary: 'test command',
			usage: name,
			handler: async (ctx) => {
				// Set up prompt, then throw — `r(null)` from the catch block
				// resolves the pending promise, which we observe via the
				// `.then` continuation BEFORE the synchronous throw lands.
				ctx.prompt('answer: ', false).then((v) => {
					observedResolution = v;
				});
				throw new Error('handler-throw');
			},
		};
		register(cmd);

		bootTerminal({ root });
		const input = root.querySelector<HTMLInputElement>('.term__input')!;
		pressEnter(input, name);

		await new Promise((r) => setTimeout(r, 50));

		expect(observedResolution).toBeNull();
	});
});
