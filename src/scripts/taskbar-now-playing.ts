/*
 * Wire the taskbar now-playing badge to `mills:now-playing` events from
 * music.ts. The badge shows the current track when Music is playing and
 * hides itself when stopped.
 *
 * External module so the production CSP `script-src 'self'` allows it —
 * see #129/#231.
 */

interface NowPlayingDetail {
	playing: boolean;
	title: string;
	artist: string;
}

function init(): void {
	const badge = document.querySelector<HTMLElement>('[data-now-playing]');
	const text = document.querySelector<HTMLElement>('[data-now-playing-text]');
	if (!badge || !text) return;
	window.addEventListener('mills:now-playing', (e) => {
		const detail = (e as CustomEvent<NowPlayingDetail>).detail;
		if (!detail?.playing) {
			badge.classList.remove('now-playing--on');
			badge.hidden = true;
			return;
		}
		text.textContent = detail.title + (detail.artist ? ' — ' + detail.artist : '');
		badge.hidden = false;
		badge.classList.add('now-playing--on');
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
