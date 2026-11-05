import { subscribeAppActivity } from './util/app-activity';

function init(): void {
	const win = document.querySelector<HTMLElement>('[data-window-id="unifi"]');
	const frame = document.querySelector<HTMLIFrameElement>('.unifi-demo__frame');
	if (!win || !frame) return;

	let loaded = false;
	const maybeLoad = (): void => {
		if (loaded) return;
		loaded = true;
		const src = frame.dataset['unifiSrc'];
		if (src) frame.src = src;
	};

	subscribeAppActivity('unifi', ({ active }) => {
		if (active) maybeLoad();
	});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export {};
