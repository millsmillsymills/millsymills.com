import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MUSIC_WINDOW_ID, MusicPlayer } from './music';

// jsdom doesn't implement <audio> playback. Stub the load/play/pause
// surface MusicPlayer depends on so the controller's lifecycle reactions
// are observable without a real media pipeline. Typed `Mock<...>` so the
// spy signatures structurally match `HTMLMediaElement.prototype.{play,
// pause, load}` -- no `as unknown as` cast needed.
interface AudioStubs {
	play: ReturnType<typeof vi.fn<() => Promise<void>>>;
	pause: ReturnType<typeof vi.fn<() => void>>;
	load: ReturnType<typeof vi.fn<() => void>>;
}

let audioStubs: AudioStubs;
let activePlayers: MusicPlayer[] = [];

beforeEach(() => {
	audioStubs = {
		play: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		pause: vi.fn<() => void>(),
		load: vi.fn<() => void>(),
	};
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
		audioStubs.play,
	);
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
		audioStubs.pause,
	);
	vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
		audioStubs.load,
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	activePlayers.forEach((p) => p.destroy());
	activePlayers = [];
	while (document.body.firstChild) {
		document.body.removeChild(document.body.firstChild);
	}
});

function makeTrackRow(
	id: string,
	src: string,
	title: string,
	artist: string,
): HTMLElement {
	const li = document.createElement('li');
	li.dataset['musicTrack'] = id;
	li.dataset['musicSrc'] = src;
	li.dataset['musicTrackTitle'] = title;
	li.dataset['musicTrackArtist'] = artist;
	return li;
}

function mountPlayer(): { root: HTMLElement; player: MusicPlayer } {
	const root = document.createElement('div');
	root.className = 'winamp';

	const cassette = document.createElement('div');
	cassette.dataset['musicState'] = 'paused';

	const title = document.createElement('span');
	title.dataset['musicTitle'] = '';
	const artist = document.createElement('span');
	artist.dataset['musicArtist'] = '';
	const current = document.createElement('span');
	current.dataset['musicCurrent'] = '';
	const duration = document.createElement('span');
	duration.dataset['musicDuration'] = '';
	const status = document.createElement('span');
	status.dataset['musicStatus'] = '';

	const playBtn = document.createElement('button');
	playBtn.dataset['musicPlay'] = '';
	const playImg = document.createElement('img');
	playBtn.appendChild(playImg);

	const muteBtn = document.createElement('button');
	muteBtn.dataset['musicMute'] = '';
	const muteImg = document.createElement('img');
	muteBtn.appendChild(muteImg);

	const prevBtn = document.createElement('button');
	prevBtn.dataset['musicPrev'] = '';
	const nextBtn = document.createElement('button');
	nextBtn.dataset['musicNext'] = '';

	const seek = document.createElement('input');
	seek.type = 'range';
	seek.dataset['musicSeek'] = '';

	const audio = document.createElement('audio');
	audio.dataset['musicAudio'] = '';

	const list = document.createElement('ol');
	list.appendChild(makeTrackRow('t1', '/audio/a.mp3', 'Track A', 'Artist'));
	list.appendChild(makeTrackRow('t2', '/audio/b.mp3', 'Track B', 'Artist'));

	root.append(
		cassette,
		title,
		artist,
		current,
		duration,
		status,
		playBtn,
		muteBtn,
		prevBtn,
		nextBtn,
		seek,
		audio,
		list,
	);
	document.body.appendChild(root);

	const player = new MusicPlayer(root);
	activePlayers.push(player);
	return { root, player };
}

function dispatchWindowOpen(id: string, userGesture: boolean): void {
	window.dispatchEvent(
		new CustomEvent('mills:window-open', { detail: { id, userGesture } }),
	);
}

function dispatchWindowClosed(id: string): void {
	window.dispatchEvent(
		new CustomEvent('mills:window-closed', { detail: { id } }),
	);
}

describe('MusicPlayer window-open autoplay', () => {
	it('autoplays the first track when music window opens with a user gesture', () => {
		mountPlayer();
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audioStubs.play).toHaveBeenCalledTimes(1);
	});

	it('does not autoplay on a code-initiated open (no user gesture)', () => {
		mountPlayer();
		dispatchWindowOpen(MUSIC_WINDOW_ID, false);
		expect(audioStubs.play).not.toHaveBeenCalled();
	});

	it('ignores window-open events for other windows', () => {
		mountPlayer();
		dispatchWindowOpen('terminal', true);
		dispatchWindowOpen('mail', true);
		expect(audioStubs.play).not.toHaveBeenCalled();
	});

	it('no-ops when a track is already loaded and playing on re-open', () => {
		mountPlayer();
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audioStubs.play).toHaveBeenCalledTimes(1);

		// Pretend playback is in flight: pin audio.paused = false. The
		// production guard `current !== -1 && !audio.paused` should short-
		// circuit before another play() call lands.
		const pausedSpy = vi
			.spyOn(HTMLMediaElement.prototype, 'paused', 'get')
			.mockReturnValue(false);
		audioStubs.play.mockClear();

		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audioStubs.play).not.toHaveBeenCalled();

		pausedSpy.mockRestore();
	});

	it('resumes via audio.play() when a track is loaded but paused', () => {
		mountPlayer();
		// First open: loads track 0 + autoplay -> 1 play call.
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audioStubs.play).toHaveBeenCalledTimes(1);

		audioStubs.play.mockClear();
		// jsdom's HTMLAudioElement.paused defaults to true even after a
		// stubbed play(), so the second open hits the `audio.play()` resume
		// arm rather than the early-return guard.
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audioStubs.play).toHaveBeenCalledTimes(1);
	});
});

describe('MusicPlayer window-closed cleanup', () => {
	it('pauses + drops audio.src + resets state on close', () => {
		const { root } = mountPlayer();
		// Open + autoplay to put the player into a "playing" state.
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		const audio = root.querySelector<HTMLAudioElement>('[data-music-audio]')!;
		expect(audio.getAttribute('src')).toBe('/audio/a.mp3');

		dispatchWindowClosed(MUSIC_WINDOW_ID);
		expect(audioStubs.pause).toHaveBeenCalled();
		expect(audio.getAttribute('src')).toBeNull();
		expect(audioStubs.load).toHaveBeenCalled();
	});

	it('ignores window-closed for other windows', () => {
		mountPlayer();
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		audioStubs.pause.mockClear();
		dispatchWindowClosed('terminal');
		expect(audioStubs.pause).not.toHaveBeenCalled();
	});

	it('restarts at track 0 after close + reopen', () => {
		const { root } = mountPlayer();
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		// Advance to next track via the "ended" event, then close + reopen.
		const audio = root.querySelector<HTMLAudioElement>('[data-music-audio]')!;
		audio.dispatchEvent(new Event('ended'));
		expect(audio.getAttribute('src')).toBe('/audio/b.mp3');

		dispatchWindowClosed(MUSIC_WINDOW_ID);
		audioStubs.play.mockClear();
		dispatchWindowOpen(MUSIC_WINDOW_ID, true);
		expect(audio.getAttribute('src')).toBe('/audio/a.mp3');
		expect(audioStubs.play).toHaveBeenCalledTimes(1);
	});
});
