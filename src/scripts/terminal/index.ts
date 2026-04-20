/*
 * Terminal bootstrap. Side-effect imports below register every command
 * module; this file then binds the REPL to the .term root inside the
 * terminal window and wires the exit handler to hide the window.
 */

import './commands/basic';
import './commands/flag';
import './commands/net';
import './commands/fun';
import './commands/mcp';
import './commands/uses';
import './commands/reset';

import { bootTerminal } from './repl';

function init(): void {
	const root = document.querySelector<HTMLElement>('.term');
	if (!root) return;

	bootTerminal({
		root,
		onExit: () => {
			const win = root.closest<HTMLElement>('.window');
			if (win) win.hidden = true;
		},
	});
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}
