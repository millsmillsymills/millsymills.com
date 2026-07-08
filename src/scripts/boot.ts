/*
 * CRT power-on intro, with a first-visit variant that plays a video
 * (muted, skippable) before the CRT flash settles the desktop. Both
 * paths run at most once per tab — the CRT flash is suppressed after
 * the first playthrough (sessionStorage) so in-tab navigation and
 * per-app permalink routes don't replay it, and the video is
 * suppressed after the first-ever visit (localStorage) so returning
 * visitors go straight to the CRT flash. Skipped entirely when the
 * user prefers reduced motion. The video can be replayed on demand
 * via a `[data-intro-replay]` trigger without touching either
 * suppression flag or re-dispatching `boot-done`.
 */

import { dispatchBootDone } from './util/events';

export const SESSION_KEY = 'mills.boot.played';
export const INTRO_KEY = 'mills.intro.seen';

const INTRO_SRC = '/videos/intro.mp4';
const INTRO_POSTER = '/videos/intro-poster.jpg';
const FINISH_DELAY_MS = 1400;
const REMOVE_DELAY_MS = 600;

let activeOverlay: HTMLElement | null = null;
let done = false;
let replayWired = false;

function prefersReducedMotion(): boolean {
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch (err) {
		console.warn('[mills.boot] matchMedia unavailable', err);
		return false;
	}
}

function shouldPlay(): boolean {
	try {
		if (sessionStorage.getItem(SESSION_KEY)) return false;
	} catch (err) {
		// Storage disabled / private browsing — degrade safe: skip the
		// animation rather than risk replaying it on every navigation.
		console.warn('[mills.boot] sessionStorage unavailable; skipping intro', err);
		return false;
	}
	return !prefersReducedMotion();
}

function shouldPlayIntro(): boolean {
	try {
		if (localStorage.getItem(INTRO_KEY)) return false;
	} catch (err) {
		// No persistent flag possible — a video that replays on every visit
		// is worse than no video; fall back to the CRT flash.
		console.warn('[mills.intro] localStorage unavailable; skipping intro', err);
		return false;
	}
	return true;
}

function markIntroSeen(): void {
	try {
		localStorage.setItem(INTRO_KEY, '1');
	} catch (err) {
		console.warn('[mills.intro] markIntroSeen failed; intro may replay', err);
	}
}

interface IntroChrome {
	readonly video: HTMLVideoElement;
	readonly controls: HTMLElement;
}

function buildIntroChrome(muted: boolean): IntroChrome {
	const video = document.createElement('video');
	video.className = 'boot-overlay__video';
	video.src = INTRO_SRC;
	video.poster = INTRO_POSTER;
	video.muted = muted;
	video.autoplay = true;
	video.setAttribute('playsinline', '');

	const controls = document.createElement('div');
	controls.className = 'boot-overlay__controls';

	const unmute = document.createElement('button');
	unmute.type = 'button';
	unmute.className = 'boot-overlay__btn';
	unmute.dataset['introUnmute'] = '';
	unmute.textContent = muted ? 'unmute' : 'mute';
	unmute.addEventListener('click', (e) => {
		e.stopPropagation();
		video.muted = !video.muted;
		unmute.textContent = video.muted ? 'unmute' : 'mute';
	});

	const skip = document.createElement('button');
	skip.type = 'button';
	skip.className = 'boot-overlay__btn';
	skip.dataset['introSkip'] = '';
	skip.textContent = 'skip intro';

	controls.append(unmute, skip);
	return { video, controls };
}

function wireIntroLifecycle(chrome: IntroChrome, settle: () => void): void {
	chrome.video.addEventListener('ended', settle, { once: true });
	chrome.video.addEventListener('error', settle, { once: true });
	chrome.controls.querySelector('[data-intro-skip]')?.addEventListener(
		'click',
		(e) => {
			e.stopPropagation();
			settle();
		},
		{ once: true },
	);
	chrome.video.play().catch((err: unknown) => {
		console.warn('[mills.intro] playback failed; settling', err);
		settle();
	});
}

function playIntro(overlay: HTMLElement): void {
	// Mark on attempt, not on completion — a flaky network must not turn the
	// one-shot intro into an every-visit retry loop.
	markIntroSeen();
	overlay.classList.add('boot-overlay--intro');
	overlay.removeAttribute('aria-hidden');

	const chrome = buildIntroChrome(true);
	overlay.append(chrome.video, chrome.controls);

	let settled = false;
	wireIntroLifecycle(chrome, () => {
		if (settled) return;
		settled = true;
		chrome.video.pause();
		chrome.video.remove();
		chrome.controls.remove();
		overlay.classList.remove('boot-overlay--intro');
		finish();
	});
}

function replayIntro(): void {
	const overlay = document.createElement('div');
	overlay.className = 'boot-overlay boot-overlay--intro boot-overlay--replay';
	const chrome = buildIntroChrome(false);
	overlay.append(chrome.video, chrome.controls);
	document.body.appendChild(overlay);
	// Replay is user-initiated post-boot: tear down only, never re-dispatch
	// boot-done (Clippy et al. would double-react).
	let settled = false;
	wireIntroLifecycle(chrome, () => {
		if (settled) return;
		settled = true;
		chrome.video.pause();
		overlay.remove();
	});
}

function initReplay(): void {
	if (replayWired) return;
	replayWired = true;
	document.addEventListener('click', (e) => {
		// Guards against a rapid double-click re-triggering replay while one
		// is already in flight (and, incidentally, against re-entrant firing
		// if init() — and thus this listener registration — ever runs more
		// than once in the same document lifetime).
		if (document.querySelector('.boot-overlay--replay')) return;
		const target = e.target as HTMLElement | null;
		const trigger = target?.closest<HTMLElement>('[data-intro-replay]');
		if (!trigger) return;
		e.preventDefault();
		e.stopPropagation();
		document.querySelector('.start-menu')?.setAttribute('hidden', '');
		replayIntro();
	});
}

function markPlayed(): void {
	try {
		sessionStorage.setItem(SESSION_KEY, '1');
	} catch (err) {
		// Marker won't persist — boot animation will replay on next load
		// in the same session. Visible regression but not a data-loss bug.
		console.warn('[mills.boot] markPlayed failed; intro may replay', err);
	}
}

export function finish(): void {
	// Latch: click-to-skip and the FINISH_DELAY_MS timer both call finish;
	// without this guard a near-1.4s click runs it twice, double-firing
	// boot-done.
	if (done) return;
	done = true;
	activeOverlay?.classList.add('boot-overlay--done');
	const overlay = activeOverlay;
	// Notify subscribers (e.g. Clippy) that the boot animation is finished
	// and the desktop is interactive.
	dispatchBootDone();
	if (overlay) setTimeout(() => overlay.remove(), REMOVE_DELAY_MS);
}

export function init(): void {
	initReplay();
	const overlay = document.querySelector<HTMLElement>('.boot-overlay');
	if (!overlay) return;

	if (!shouldPlay()) {
		overlay.remove();
		// Even when the boot animation is suppressed (already-played in this
		// session, or prefers-reduced-motion), the desktop is interactive.
		// Subscribers (e.g. Clippy) need to know.
		dispatchBootDone();
		return;
	}

	markPlayed();
	activeOverlay = overlay;
	done = false;

	if (shouldPlayIntro()) {
		playIntro(overlay);
		return;
	}

	overlay.classList.add('boot-overlay--on');

	// allow click-to-skip
	overlay.addEventListener('click', finish, { once: true });

	setTimeout(finish, FINISH_DELAY_MS);
}

/**
 * Test-only: clear module-scope state so each spec starts from a
 * known fresh-tab baseline. Underscored to make the not-for-prod
 * intent loud. Mirrors the `__resetForTests` pattern used in
 * `system-sounds.ts`.
 */
export function __resetForTests(): void {
	activeOverlay = null;
	done = false;
	replayWired = false;
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}
