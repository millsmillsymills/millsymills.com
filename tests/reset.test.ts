import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAll } from '../src/scripts/reset';

let dialog: HTMLElement;
let shutdown: HTMLElement;
let yes: HTMLButtonElement;
let no: HTMLButtonElement;

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	dialog = document.createElement('div');
	dialog.className = 'reset-confirm';
	dialog.hidden = true;
	yes = document.createElement('button');
	yes.dataset['resetYes'] = '';
	no = document.createElement('button');
	no.dataset['resetNo'] = '';
	dialog.append(no, yes);
	shutdown = document.createElement('div');
	shutdown.dataset['shutdownOverlay'] = '';
	shutdown.hidden = true;
	document.body.append(dialog, shutdown);
	// Keep the farewell visible without navigating away from the test DOM.
	vi.useFakeTimers();
	vi.spyOn(window, 'setTimeout');
	vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		callback(0);
		return 0;
	});
});

afterEach(() => {
	// Close any still-open modal to release its window listeners.
	no.click();
	dialog.remove();
	shutdown.remove();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	localStorage.clear();
	sessionStorage.clear();
});

function seedStorage(): void {
	for (const storage of [localStorage, sessionStorage]) {
		storage.setItem('mills.first', 'first');
		storage.setItem('mills.second', 'second');
		storage.setItem('other.site', 'keep');
		storage.setItem('mills', 'keep exact boundary');
	}
}

describe('reset confirmation and storage purge', () => {
	it('clears every mills.* key in both stores after confirmation, preserving other keys', () => {
		seedStorage();
		resetAll();
		expect(dialog.hidden).toBe(false);
		expect(localStorage.getItem('mills.first')).toBe('first');

		yes.click();

		for (const storage of [localStorage, sessionStorage]) {
			expect(storage.getItem('mills.first')).toBeNull();
			expect(storage.getItem('mills.second')).toBeNull();
			expect(storage.getItem('other.site')).toBe('keep');
			expect(storage.getItem('mills')).toBe('keep exact boundary');
		}
		expect(dialog.hidden).toBe(true);
		expect(shutdown.hidden).toBe(false);
		expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2400);
	});

	it.each(['cancel', 'Escape'])('%s preserves both stores and allows reopening', (action) => {
		seedStorage();
		resetAll();
		if (action === 'cancel') no.click();
		else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(dialog.hidden).toBe(true);
		for (const storage of [localStorage, sessionStorage]) {
			expect(storage.getItem('mills.first')).toBe('first');
			expect(storage.getItem('mills.second')).toBe('second');
		}
		expect(shutdown.hidden).toBe(true);
		expect(window.setTimeout).not.toHaveBeenCalled();
		resetAll();
		expect(dialog.hidden).toBe(false);
	});

	it('refuses to purge when the confirmation dialog is missing', () => {
		seedStorage();
		dialog.remove();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		resetAll();

		expect(localStorage.getItem('mills.first')).toBe('first');
		expect(sessionStorage.getItem('mills.first')).toBe('first');
		expect(error).toHaveBeenCalledWith(expect.stringContaining('refusing to wipe state'));
		expect(window.setTimeout).not.toHaveBeenCalled();
	});

	it('does not show success or schedule navigation when storage removal fails', () => {
		seedStorage();
		vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		resetAll();

		yes.click();

		expect(localStorage.getItem('mills.first')).toBe('first');
		expect(shutdown.hidden).toBe(true);
		expect(window.setTimeout).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(expect.stringContaining('purge failed'), expect.any(DOMException));
	});
});
