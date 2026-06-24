/*
 * Toggle the taskbar online/offline indicator using `navigator.onLine`
 * plus the `online`/`offline` window events. External module so the
 * production CSP `script-src 'self'` allows it — see #129/#231.
 */

function init(): void {
	const el = document.querySelector<HTMLElement>('[data-taskbar-online]');
	if (!el) return;
	const update = (): void => {
		const online = navigator.onLine;
		el.dataset['online'] = online ? 'true' : 'false';
		el.setAttribute(
			'aria-label',
			online ? 'connection: online' : 'connection: offline',
		);
	};
	update();
	window.addEventListener('online', update);
	window.addEventListener('offline', update);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
