import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetForTests, finish, init, SESSION_KEY } from './boot';

function renderOverlay(): HTMLElement {
	const overlay = document.createElement('div');
	overlay.className = 'boot-overlay';
	document.body.appendChild(overlay);
	return overlay;
}

function countBootDone(signal: AbortSignal): () => number {
	let count = 0;
	const handler = () => {
		count += 1;
	};
	window.addEventListener('mills:boot-done', handler, { signal });
	return () => count;
}

describe('boot SESSION_KEY', () => {
	it('matches the mills.* prefix so reset.ts sweeps it', () => {
		expect(SESSION_KEY).toBe('mills.boot.played');
		expect(SESSION_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('boot once-only boot-done', () => {
	let listeners: AbortController;

	beforeEach(() => {
		listeners = new AbortController();
		vi.useFakeTimers();
		sessionStorage.clear();
		__resetForTests();
	});

	afterEach(() => {
		listeners.abort();
		vi.useRealTimers();
		sessionStorage.clear();
		__resetForTests();
		while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
		vi.restoreAllMocks();
	});

	it('dispatches boot-done exactly once when both click-skip and the timer fire', () => {
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);

		init();

		// click-to-skip fires finish, then the ~1.4s timer fires it again.
		overlay.click();
		vi.advanceTimersByTime(1400);

		expect(fired()).toBe(1);
	});

	it('dispatches boot-done exactly once when only the timer fires', () => {
		renderOverlay();
		const fired = countBootDone(listeners.signal);

		init();
		vi.advanceTimersByTime(1400);

		expect(fired()).toBe(1);
	});

	it('does not re-dispatch on a redundant direct finish() call', () => {
		renderOverlay();
		const fired = countBootDone(listeners.signal);

		init();
		finish();
		finish();

		expect(fired()).toBe(1);
	});
});
