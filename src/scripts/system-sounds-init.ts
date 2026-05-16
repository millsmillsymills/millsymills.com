/*
 * Side-effect bootstrap for system sounds. Attaches the global event
 * listeners and binds the taskbar mute/unmute toggle. The pure state
 * + playback API lives in `system-sounds.ts` so tests can import
 * without triggering DOM wiring.
 */

import { isEnabled, markGesture, play, setEnabled } from './system-sounds';

function syncToggle(button: HTMLButtonElement): void {
	const enabled = isEnabled();
	const icon = button.querySelector<HTMLImageElement>('img');
	if (icon) {
		icon.src = enabled
			? '/images/vaporwave-ui/buttons/unmute.png'
			: '/images/vaporwave-ui/buttons/mute.png';
		icon.alt = enabled ? 'sound: on' : 'sound: off';
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
	window.addEventListener('error', () => play('error'));

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
