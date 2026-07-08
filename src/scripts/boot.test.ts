import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetForTests, finish, init, INTRO_KEY, SESSION_KEY } from './boot';

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
		// This suite exercises the repeat-visitor CRT-only path — seed
		// INTRO_KEY so it doesn't collide with the first-visit video path
		// covered separately below.
		localStorage.setItem(INTRO_KEY, '1');
		__resetForTests();
	});

	afterEach(() => {
		listeners.abort();
		vi.useRealTimers();
		sessionStorage.clear();
		localStorage.clear();
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

describe('INTRO_KEY', () => {
	it('matches the mills.* prefix so reset.ts sweeps it', () => {
		expect(INTRO_KEY).toBe('mills.intro.seen');
		expect(INTRO_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('first-visit intro video', () => {
	let listeners: AbortController;
	let playMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		listeners = new AbortController();
		vi.useFakeTimers();
		sessionStorage.clear();
		localStorage.clear();
		__resetForTests();
		playMock = vi
			.spyOn(HTMLMediaElement.prototype, 'play')
			.mockImplementation(() => Promise.resolve());
		vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	});

	afterEach(() => {
		listeners.abort();
		vi.useRealTimers();
		sessionStorage.clear();
		localStorage.clear();
		__resetForTests();
		while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
		vi.restoreAllMocks();
	});

	it('creates a muted video on first visit and marks INTRO_KEY', () => {
		const overlay = renderOverlay();
		init();

		const video = overlay.querySelector<HTMLVideoElement>('.boot-overlay__video');
		expect(video).not.toBeNull();
		expect(video?.muted).toBe(true);
		expect(localStorage.getItem(INTRO_KEY)).toBe('1');
	});

	it('dispatches boot-done exactly once when the video ends', async () => {
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();

		const video = overlay.querySelector<HTMLVideoElement>('.boot-overlay__video');
		video?.dispatchEvent(new Event('ended'));
		await vi.runAllTimersAsync();

		expect(fired()).toBe(1);
		expect(document.querySelector('.boot-overlay')).toBeNull();
	});

	it('skip button settles the intro and dispatches boot-done once', async () => {
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();

		overlay.querySelector<HTMLButtonElement>('[data-intro-skip]')?.click();
		await vi.runAllTimersAsync();

		expect(fired()).toBe(1);
	});

	it('falls back to boot-done when the video errors', async () => {
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();

		overlay.querySelector<HTMLVideoElement>('.boot-overlay__video')?.dispatchEvent(
			new Event('error'),
		);
		await vi.runAllTimersAsync();

		expect(fired()).toBe(1);
	});

	it('falls back to boot-done when play() rejects', async () => {
		playMock.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
		renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();
		await vi.runAllTimersAsync();

		expect(fired()).toBe(1);
	});

	it('skips the video when INTRO_KEY is already set (CRT path)', () => {
		localStorage.setItem(INTRO_KEY, '1');
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();

		expect(overlay.querySelector('.boot-overlay__video')).toBeNull();
		vi.advanceTimersByTime(1400);
		expect(fired()).toBe(1);
	});

	it('skips the video under prefers-reduced-motion', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true,
		} as MediaQueryList);
		const overlay = renderOverlay();
		const fired = countBootDone(listeners.signal);
		init();

		// reduced motion suppresses the whole boot animation (existing behavior)
		expect(overlay.isConnected).toBe(false);
		expect(fired()).toBe(1);
	});

	it('degrades to CRT when localStorage is unavailable', () => {
		// vitest.setup.ts backs localStorage with a plain-class MemoryStorage
		// shim (not a Storage subclass, to dodge Node's built-in webstorage
		// collision), so spying on Storage.prototype doesn't intercept calls
		// on the actual localStorage instance — spy on the instance instead.
		vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
			if (key === INTRO_KEY) throw new Error('denied');
			return null;
		});
		const overlay = renderOverlay();
		init();

		expect(overlay.querySelector('.boot-overlay__video')).toBeNull();
	});
});

describe('replay intro', () => {
	let listeners: AbortController;

	beforeEach(() => {
		listeners = new AbortController();
		vi.useFakeTimers();
		sessionStorage.clear();
		localStorage.clear();
		__resetForTests();
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
		vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	});

	afterEach(() => {
		listeners.abort();
		vi.useRealTimers();
		sessionStorage.clear();
		localStorage.clear();
		__resetForTests();
		while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
		vi.restoreAllMocks();
	});

	function bootThenOpenMenu(): HTMLButtonElement {
		localStorage.setItem(INTRO_KEY, '1');
		renderOverlay();
		init();
		vi.advanceTimersByTime(1400 + 600);
		const btn = document.createElement('button');
		btn.dataset['introReplay'] = '';
		document.body.appendChild(btn);
		return btn;
	}

	it('replays unmuted on [data-intro-replay] click and never re-fires boot-done', async () => {
		const fired = countBootDone(listeners.signal);
		const btn = bootThenOpenMenu();
		const before = fired();

		btn.click();
		const video = document.querySelector<HTMLVideoElement>('.boot-overlay__video');
		expect(video).not.toBeNull();
		expect(video?.muted).toBe(false);

		video?.dispatchEvent(new Event('ended'));
		await vi.runAllTimersAsync();
		expect(document.querySelector('.boot-overlay--replay')).toBeNull();
		expect(fired()).toBe(before);
	});
});
