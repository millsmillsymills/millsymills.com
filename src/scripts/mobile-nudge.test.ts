import { afterEach, describe, expect, it } from 'vitest';

import { init, STORAGE_KEY } from './mobile-nudge';

function renderBanner(): HTMLElement {
	const banner = document.createElement('aside');
	banner.className = 'mshell__nudge';
	banner.dataset.mobileNudge = '';
	banner.setAttribute('role', 'status');
	banner.hidden = true;

	const text = document.createElement('p');
	text.className = 'mshell__nudge-text';
	text.textContent = 'copy';
	banner.appendChild(text);

	const close = document.createElement('button');
	close.type = 'button';
	close.dataset.mobileNudgeDismiss = '';
	close.setAttribute('aria-label', 'dismiss');
	close.textContent = '×';
	banner.appendChild(close);

	document.body.appendChild(banner);
	return banner;
}

afterEach(() => {
	sessionStorage.clear();
	while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe('mobile-nudge STORAGE_KEY', () => {
	it('matches the mills.* prefix so reset.ts sweeps it', () => {
		expect(STORAGE_KEY).toBe('mills.mobile-nudge.dismissed');
		expect(STORAGE_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('mobile-nudge init', () => {
	it('reveals the banner when not previously dismissed', () => {
		const banner = renderBanner();
		expect(banner.hidden).toBe(true);
		init();
		expect(banner.hidden).toBe(false);
	});

	it('leaves the banner hidden when sessionStorage marks it dismissed', () => {
		sessionStorage.setItem(STORAGE_KEY, '1');
		const banner = renderBanner();
		init();
		expect(banner.hidden).toBe(true);
	});

	it('hides the banner and persists dismissal on close-button click', () => {
		const banner = renderBanner();
		init();
		const btn = banner.querySelector<HTMLButtonElement>(
			'[data-mobile-nudge-dismiss]',
		)!;
		btn.click();
		expect(banner.hidden).toBe(true);
		expect(sessionStorage.getItem(STORAGE_KEY)).toBe('1');
	});

	it('no-ops when the banner element is not in the DOM', () => {
		expect(() => init()).not.toThrow();
	});
});
