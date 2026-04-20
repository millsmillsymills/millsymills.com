/*
 * Terminal bootstrap.
 *
 * Importing this file:
 *   - registers every command (basic, flag, net, fun)
 *   - binds the REPL to the .term root inside the terminal window
 *   - wires the close button to hide the window
 */

import './commands/basic';
import './commands/flag';
import './commands/net';
import './commands/fun';

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
