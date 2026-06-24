function init(): void {
	const win = document.querySelector<HTMLElement>('[data-window-id="unifi"]');
	const frame = document.querySelector<HTMLIFrameElement>('.unifi-demo__frame');
	if (!win || !frame) return;

	let loaded = false;
	const maybeLoad = (): void => {
		if (loaded || win.hidden) return;
		loaded = true;
		const src = frame.dataset['unifiSrc'];
		if (src) frame.src = src;
	};

	// Load on first reveal. Watching the window's `hidden` attribute is the
	// canonical "this app just opened" signal in this codebase: window-manager
	// flips it on desktop, and the mobile shell mirrors it via
	// syncDesktopWindowHidden. The desktop-only `mills:window-open` event never
	// fires in the mobile shell, which left the iframe blank there.
	const observer = new MutationObserver(maybeLoad);
	observer.observe(win, { attributes: true, attributeFilter: ['hidden'] });
	maybeLoad();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export {};
