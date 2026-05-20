/*
 * Side-effect bootstrap for system sounds. Attaches the global event
 * listeners and binds the taskbar mute/unmute toggle. The pure state
 * + playback API lives in `system-sounds.ts` so tests can import
 * without triggering DOM wiring.
 */

import { isEnabled, markGesture, play, setEnabled } from './system-sounds';

function syncToggle(button: HTMLButtonElement): void {
	const enabled = isEnabled();
	const glyph = button.querySelector<HTMLElement>('[data-sound-glyph]');
	if (glyph) {
		// 🔊 (U+1F50A) speaker w/ three waves; 🔇 (U+1F507) speaker w/ stroke.
		glyph.textContent = enabled ? '🔊' : '🔇';
	}
	button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
	button.setAttribute(
		'aria-label',
		enabled ? 'system sounds: on — click to mute' : 'system sounds: off — click to unmute',
	);
	button.dataset.soundEnabled = enabled ? 'true' : 'false';
}

function bindToggle(): void {
	const button = document.querySelector<HTMLButtonElement>('[data-sound-toggle]');
	if (!button) return;
	syncToggle(button);
	button.addEventListener('click', () => {
		setEnabled(!isEnabled());
		syncToggle(button);
	});
}

function init(): void {
	window.addEventListener('mills:play-sound', (e) => play(e.detail.kind));
	window.addEventListener('mills:boot-done', () => play('startup'));
	// Gate on `e.error != null` so resource-load failures (broken <img>,
	// <script>, etc., which can also surface as ErrorEvent in some flows)
	// don't chime — only real uncaught runtime errors do.
	window.addEventListener('error', (e) => {
		if (e.error != null) play('error');
	});

	window.addEventListener('pointerdown', markGesture, { once: true, capture: true });
	window.addEventListener('keydown', markGesture, { once: true, capture: true });

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bindToggle);
	} else {
		bindToggle();
	}
}

if (typeof window !== 'undefined') init();

export {};
