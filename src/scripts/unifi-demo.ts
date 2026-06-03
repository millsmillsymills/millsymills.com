function init(): void {
	const win = document.querySelector<HTMLElement>('[data-window-id="unifi"]');
	const frame = document.querySelector<HTMLIFrameElement>('.unifi-demo__frame');
	if (!win || !frame) return;

	let loaded = false;
	const load = (): void => {
		if (loaded) return;
		loaded = true;
		const src = frame.dataset.unifiSrc;
		if (src) frame.src = src;
	};

	// Subscribe to the window-manager's open event for future opens; the
	// initial !hidden check covers a window restored open before this
	// listener registers, where the event has already fired.
	window.addEventListener('mills:window-open', (event) => {
		if (event.detail.id === 'unifi') load();
	});
	if (!win.hidden) load();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export {};
