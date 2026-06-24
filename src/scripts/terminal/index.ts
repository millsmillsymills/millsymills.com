/*
 * Terminal bootstrap. Side-effect imports below register every command
 * module; this file then binds the REPL to the .term root inside the
 * terminal window and wires the exit handler to hide the window.
 */

import './commands/basic';
import './commands/net';
import './commands/fun';
import './commands/mcp';
import './commands/uses';
import './commands/reset';

import { bootTerminal } from './repl';
import { dispatchCloseWindow } from '../util/events';

function init(): void {
	const root = document.querySelector<HTMLElement>('.term');
	if (!root) return;

	bootTerminal({
		root,
		onExit: () => {
			const win = root.closest<HTMLElement>('.window');
			const id = win?.dataset['windowId'];
			if (!id) {
				console.warn('[mills.terminal] no enclosing .window[data-window-id]; exit no-op');
				return;
			}
			// Route through the WindowManager so the taskbar item, open-stack,
			// and z-order all stay in sync. Mutating .hidden directly here
			// left stale state behind (#51).
			dispatchCloseWindow(id);
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
