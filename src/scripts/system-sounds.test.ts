import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	__resetForTests,
	isEnabled,
	markGesture,
	play,
	setEnabled,
	SOURCES,
	STORAGE_KEY,
} from './system-sounds';

describe('system-sounds.ts STORAGE_KEY', () => {
	it('matches the mills.* prefix so reset.ts sweeps it', () => {
		expect(STORAGE_KEY).toBe('mills.sounds.enabled');
		expect(STORAGE_KEY.startsWith('mills.')).toBe(true);
	});
});

describe('system-sounds.ts SOURCES', () => {
	it('covers every SoundKind with a /sounds/<file>.wav path', () => {
		const kinds: Array<keyof typeof SOURCES> = [
			'open',
			'close',
			'error',
			'startup',
			'reset',
		];
		for (const k of kinds) {
			expect(SOURCES[k]).toMatch(/^\/sounds\/[\w-]+\.wav$/);
		}
	});
});

describe('system-sounds.ts isEnabled / setEnabled', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('defaults to false when no value is set', () => {
		expect(isEnabled()).toBe(false);
	});

	it('round-trips true through localStorage', () => {
		setEnabled(true);
		expect(isEnabled()).toBe(true);
	});

	it('round-trips false through localStorage', () => {
		setEnabled(true);
		setEnabled(false);
		expect(isEnabled()).toBe(false);
	});

	it('treats any non-"1" stored value as disabled (no truthiness surprises)', () => {
		localStorage.setItem(STORAGE_KEY, 'yes');
		expect(isEnabled()).toBe(false);
		localStorage.setItem(STORAGE_KEY, 'true');
		expect(isEnabled()).toBe(false);
	});

	it('returns false when localStorage.getItem throws', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
			throw new DOMException('SecurityError', 'SecurityError');
		});
		expect(isEnabled()).toBe(false);
		expect(warn).toHaveBeenCalledOnce();
	});

	it('swallows setItem failures', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError', 'QuotaExceededError');
		});
		expect(() => setEnabled(true)).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------
// Gesture-latch + deferred-startup state machine.
//
// `Audio` is stubbed globally so each `new Audio(...)` returns the
// same recorded instance per kind, with `.play()` resolved (never
// rejected) so the gesture-gate is the only thing affecting playback
// behaviour the test cares about.
// ---------------------------------------------------------------

interface FakeAudio {
	src: string;
	preload: string;
	currentTime: number;
	play: ReturnType<typeof vi.fn>;
}

let audioCtor: ReturnType<typeof vi.fn>;
let instances: FakeAudio[];

function installAudioStub(): void {
	instances = [];
	// Regular function (not arrow) so `new Audio(...)` is legal —
	// arrows can't be invoked as constructors.
	audioCtor = vi.fn(function (this: FakeAudio, src: string) {
		this.src = src;
		this.preload = '';
		this.currentTime = 0;
		this.play = vi.fn().mockResolvedValue(undefined);
		instances.push(this);
	});
	vi.stubGlobal('Audio', audioCtor);
}

describe('system-sounds.ts gesture-latch + deferred-startup', () => {
	beforeEach(() => {
		localStorage.clear();
		__resetForTests();
		installAudioStub();
	});

	afterEach(() => {
		localStorage.clear();
		__resetForTests();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('play() is a no-op when sounds are disabled, even post-gesture', () => {
		// default off + gesture seen
		markGesture();
		play('open');
		expect(audioCtor).not.toHaveBeenCalled();
	});

	it('play(non-startup) pre-gesture is silently dropped (not deferred)', () => {
		setEnabled(true);
		play('open');
		play('close');
		play('error');
		play('reset');
		expect(audioCtor).not.toHaveBeenCalled();
		// First gesture should NOT then drain queued non-startup kinds.
		markGesture();
		expect(audioCtor).not.toHaveBeenCalled();
	});

	it('play(\'startup\') pre-gesture queues but does not allocate Audio', () => {
		setEnabled(true);
		play('startup');
		expect(audioCtor).not.toHaveBeenCalled();
	});

	it('markGesture() after pending startup fires exactly one play call', () => {
		setEnabled(true);
		play('startup');
		markGesture();
		expect(audioCtor).toHaveBeenCalledTimes(1);
		expect(audioCtor).toHaveBeenCalledWith(SOURCES.startup);
		expect(instances[0]?.play).toHaveBeenCalledTimes(1);
	});

	it('markGesture() is idempotent — second call does not replay startup', () => {
		setEnabled(true);
		play('startup');
		markGesture();
		markGesture();
		markGesture();
		expect(audioCtor).toHaveBeenCalledTimes(1);
		expect(instances[0]?.play).toHaveBeenCalledTimes(1);
	});

	it('disabling sounds between deferred queue and first gesture cancels the chime', () => {
		setEnabled(true);
		play('startup');
		setEnabled(false);
		markGesture();
		expect(audioCtor).not.toHaveBeenCalled();
	});

	it('post-gesture play(kind) pools the Audio: second play reuses, resets currentTime', () => {
		setEnabled(true);
		markGesture();
		play('open');
		play('open');
		expect(audioCtor).toHaveBeenCalledTimes(1);
		expect(audioCtor).toHaveBeenCalledWith(SOURCES.open);
		expect(instances[0]?.play).toHaveBeenCalledTimes(2);
		expect(instances[0]?.currentTime).toBe(0);
	});

	it('play() swallows a rejected play() promise without throwing', async () => {
		setEnabled(true);
		markGesture();
		// Reinstall stub so play() rejects, mimicking an autoplay-block
		// race the gesture-gate is supposed to prevent.
		audioCtor.mockImplementationOnce(function (this: FakeAudio, src: string) {
			this.src = src;
			this.preload = '';
			this.currentTime = 0;
			this.play = vi.fn().mockRejectedValue(new DOMException('NotAllowedError'));
			instances.push(this);
		});
		expect(() => play('open')).not.toThrow();
		// Let the swallowed .catch() drain.
		await Promise.resolve();
	});
});
