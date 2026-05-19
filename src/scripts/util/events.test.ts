import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	dispatchWindowClosed,
	dispatchWindowOpen,
} from './events';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('dispatchWindowOpen', () => {
	it('fires a mills:window-open CustomEvent with the id + userGesture', () => {
		const seen: Array<{ id: string; userGesture: boolean }> = [];
		const handler = (e: Event): void => {
			seen.push((e as CustomEvent<{ id: string; userGesture: boolean }>).detail);
		};
		window.addEventListener('mills:window-open', handler);
		try {
			dispatchWindowOpen('music', true);
			dispatchWindowOpen('mail', false);
		} finally {
			window.removeEventListener('mills:window-open', handler);
		}
		expect(seen).toEqual([
			{ id: 'music', userGesture: true },
			{ id: 'mail', userGesture: false },
		]);
	});
});

describe('dispatchWindowClosed', () => {
	it('fires a mills:window-closed CustomEvent with the id', () => {
		const seen: string[] = [];
		const handler = (e: Event): void => {
			seen.push((e as CustomEvent<{ id: string }>).detail.id);
		};
		window.addEventListener('mills:window-closed', handler);
		try {
			dispatchWindowClosed('music');
		} finally {
			window.removeEventListener('mills:window-closed', handler);
		}
		expect(seen).toEqual(['music']);
	});
});
