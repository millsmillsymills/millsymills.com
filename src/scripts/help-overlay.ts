/*
 * "?" help overlay — shows a keyboard-shortcut cheat sheet.
 *
 * Triggered by pressing "?" anywhere except while typing into an
 * <input> / <textarea> / contenteditable (so the terminal and the
 * command palette keep their keystrokes).
 */

function init(): void {
	const overlay = document.querySelector<HTMLElement>('.help');
	if (!overlay) return;

	const close = () => {
		overlay.hidden = true;
	};
	const open = () => {
		overlay.hidden = false;
	};
	const toggle = () => {
		if (overlay.hidden) open();
		else close();
	};

	overlay.querySelector<HTMLButtonElement>('.help__close')?.addEventListener('click', close);
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});

	window.addEventListener('keydown', (e) => {
		if (!overlay.hidden && e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (e.key !== '?') return;
		const target = e.target;
		if (target instanceof HTMLElement) {
			const tag = target.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
		}
		e.preventDefault();
		toggle();
	});
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
