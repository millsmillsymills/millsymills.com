/*
 * Music player controller for the vaporplayer window.
 *
 * Wires the rendered controls + playlist to a single <audio> element.
 * Handles missing audio files gracefully — clicking play on a 404
 * shows "track unavailable" rather than crashing.
 */

import { dispatchNowPlaying } from './util/events';

// Internal runtime track shape — distinct from src/data/playlist.ts's Track,
// which is the canonical readonly playlist data. Kept separate so the
// player can mutate (e.g. tracks.push) without bumping into the data
// module's readonly contract.
interface Track {
	id: string;
	src: string;
	title: string;
	artist: string;
}

/**
 * Map a play() rejection to a user-visible status. Browsers reject for two
 * very different reasons that we want to communicate distinctly:
 *
 *   - NotAllowedError: autoplay policy blocked playback. The user needs
 *     to click play themselves to grant permission.
 *   - NotSupportedError / DOMException: the source 404'd, the codec is
 *     unsupported, or the URL is otherwise unplayable.
 *
 * The previous "cannot play" message conflated both, so a missing track
 * looked indistinguishable from "your browser is being safe."
 */
function playErrorMessage(err: unknown): string {
	const name = (err as { name?: string } | null)?.name;
	if (name === 'NotAllowedError') return 'click play to start';
	if (name === 'NotSupportedError') return 'track unavailable';
	// AbortError fires when a new load() interrupts an in-flight play —
	// transient and self-resolving, so the generic message is fine.
	return 'cannot play';
}

// Window id of the vaporplayer shell -- see src/data/apps.ts
// and the rendered `<div class="window" data-window-id="music">` in the
// desktop layout. Subscribers to mills:window-open / mills:window-closed
// filter on this string to decide whether the event is theirs.
export const MUSIC_WINDOW_ID = 'music';

export class MusicPlayer {
	private audio: HTMLAudioElement;
	private tracks: Track[] = [];
	private current = -1;
	// Lifetime guard for window-level listeners (window-open/closed). The
	// production page has one MusicPlayer per page, so a leak doesn't
	// matter there; the destroy() handle exists so tests can mount + unmount
	// repeatedly without accumulating listeners on `window`.
	private abort = new AbortController();

	private titleEl: HTMLElement | null;
	private artistEl: HTMLElement | null;
	private currentEl: HTMLElement | null;
	private durationEl: HTMLElement | null;
	private statusEl: HTMLElement | null;
	private playBtn: HTMLButtonElement | null;
	private muteBtn: HTMLButtonElement | null;
	private seekBar: HTMLInputElement | null;
	private cassetteEl: HTMLElement | null;
	private playGlyph: HTMLElement | null;
	private muteGlyph: HTMLElement | null;

	constructor(root: HTMLElement) {
		this.audio = root.querySelector<HTMLAudioElement>('[data-music-audio]')!;
		this.titleEl = root.querySelector<HTMLElement>('[data-music-title]');
		this.artistEl = root.querySelector<HTMLElement>('[data-music-artist]');
		this.currentEl = root.querySelector<HTMLElement>('[data-music-current]');
		this.durationEl = root.querySelector<HTMLElement>('[data-music-duration]');
		this.statusEl = root.querySelector<HTMLElement>('[data-music-status]');
		this.playBtn = root.querySelector<HTMLButtonElement>('[data-music-play]');
		this.muteBtn = root.querySelector<HTMLButtonElement>('[data-music-mute]');
		this.seekBar = root.querySelector<HTMLInputElement>('[data-music-seek]');
		this.cassetteEl = root.querySelector<HTMLElement>('[data-music-state]');
		this.playGlyph =
			this.playBtn?.querySelector<HTMLElement>('[data-music-play-glyph]') ?? null;
		this.muteGlyph =
			this.muteBtn?.querySelector<HTMLElement>('[data-music-mute-glyph]') ?? null;

		root.querySelectorAll<HTMLElement>('[data-music-track]').forEach((el, i) => {
			this.tracks.push({
				id: el.dataset.musicTrack ?? `t${i}`,
				src: el.dataset.musicSrc ?? '',
				title: el.dataset.musicTrackTitle ?? '',
				artist: el.dataset.musicTrackArtist ?? '',
			});
			el.addEventListener('click', () => this.load(i, true));
		});

		this.bindControls(root);
		this.bindAudioEvents();
		this.bindWindowLifecycle();
	}

	/**
	 * Issue #402: opening music.exe IS the play gesture. Autoplay the
	 * first track when the window-manager fires a true open with a real
	 * user gesture; on deep-link / restore-from-storage opens (`silent`
	 * path -> `userGesture: false`) leave the player paused so the
	 * autoplay-policy NotAllowedError doesn't fire.
	 *
	 * Close path: pause and clear audio.src so a closed window doesn't
	 * keep streaming. Re-opening triggers a fresh autoplay.
	 */
	private bindWindowLifecycle(): void {
		const { signal } = this.abort;
		window.addEventListener(
			'mills:window-open',
			(event) => {
				if (event.detail.id !== MUSIC_WINDOW_ID) return;
				if (!event.detail.userGesture) return;
				// If a track is already loaded and playing (e.g. user
				// re-opened a previously-minimized window), don't restart.
				if (this.current !== -1 && !this.audio.paused) return;
				if (this.current === -1) {
					this.load(0, true);
				} else {
					this.audio
						.play()
						.catch((err) => this.setStatus(playErrorMessage(err)));
				}
			},
			{ signal },
		);

		window.addEventListener(
			'mills:window-closed',
			(event) => {
				if (event.detail.id !== MUSIC_WINDOW_ID) return;
				this.audio.pause();
				// Releasing the src tells the browser it can drop the buffered
				// audio. The next open re-loads via this.load(0, true) so the
				// playhead resets to the start of the playlist intentionally.
				this.audio.removeAttribute('src');
				this.audio.load();
				this.current = -1;
				this.refreshTrackHighlight();
			},
			{ signal },
		);
	}

	/**
	 * Release window-level listeners so a long-lived page (HMR, tests, future
	 * SPA navigation) can dispose a MusicPlayer cleanly without leaking event
	 * subscriptions. The production page only instantiates one MusicPlayer for
	 * its lifetime; this is here for test hygiene + future-proofing.
	 */
	destroy(): void {
		this.abort.abort();
	}

	private bindControls(root: HTMLElement): void {
		this.playBtn?.addEventListener('click', () => this.togglePlay());
		this.muteBtn?.addEventListener('click', () => this.toggleMute());
		root.querySelector('[data-music-prev]')?.addEventListener('click', () => this.prev());
		root.querySelector('[data-music-next]')?.addEventListener('click', () => this.next());

		this.seekBar?.addEventListener('input', () => {
			if (!this.audio.duration || !this.seekBar) return;
			this.audio.currentTime = (Number(this.seekBar.value) / 100) * this.audio.duration;
		});
	}

	private bindAudioEvents(): void {
		this.audio.addEventListener('timeupdate', () => this.renderTime());
		this.audio.addEventListener('durationchange', () => this.renderTime());
		this.audio.addEventListener('ended', () => this.next());
		this.audio.addEventListener('play', () => {
			this.setStatus('playing');
			this.setPlayGlyph('pause');
			this.cassetteEl?.setAttribute('data-music-state', 'playing');
			this.emitNowPlaying();
		});
		this.audio.addEventListener('pause', () => {
			this.setStatus('paused');
			this.setPlayGlyph('play');
			this.cassetteEl?.setAttribute('data-music-state', 'paused');
			this.emitNowPlaying({ playing: false });
		});
		this.audio.addEventListener('error', () => {
			this.setStatus('track unavailable');
			this.setPlayGlyph('play');
			this.cassetteEl?.setAttribute('data-music-state', 'paused');
			if (this.titleEl) this.titleEl.textContent = '(404 — drop audio into public/audio/)';
			this.emitNowPlaying({ playing: false });
		});
	}

	private emitNowPlaying(opts: { playing?: boolean } = {}): void {
		const track = this.tracks[this.current];
		const playing = opts.playing ?? !this.audio.paused;
		dispatchNowPlaying({
			playing,
			title: track?.title ?? '',
			artist: track?.artist ?? '',
		});
	}

	private load(i: number, autoplay = false): void {
		if (i < 0 || i >= this.tracks.length) return;
		this.current = i;
		const track = this.tracks[i];
		this.audio.src = track.src;
		if (this.titleEl) {
			this.titleEl.textContent = track.title;
			// Mirror full string into `title` so the ellipsis-truncated cell
			// still surfaces the whole track name on hover / long-press.
			this.titleEl.title = track.title;
		}
		if (this.artistEl) {
			this.artistEl.textContent = track.artist;
			this.artistEl.title = track.artist;
		}
		this.refreshTrackHighlight();
		if (autoplay) this.audio.play().catch((err) => this.setStatus(playErrorMessage(err)));
	}

	private refreshTrackHighlight(): void {
		document.querySelectorAll<HTMLElement>('[data-music-track]').forEach((el, i) => {
			el.classList.toggle('winamp__track--current', i === this.current);
		});
	}

	private togglePlay(): void {
		if (this.current === -1) {
			this.load(0, true);
			return;
		}
		if (this.audio.paused) this.audio.play().catch((err) => this.setStatus(playErrorMessage(err)));
		else this.audio.pause();
	}

	private toggleMute(): void {
		this.audio.muted = !this.audio.muted;
		if (this.muteGlyph) {
			// 🔇 (U+1F507) speaker w/ cancellation stroke; 🔊 (U+1F50A) full volume.
			this.muteGlyph.textContent = this.audio.muted ? '🔇' : '🔊';
		}
		if (this.muteBtn) {
			this.muteBtn.setAttribute('aria-pressed', String(this.audio.muted));
			this.muteBtn.setAttribute('aria-label', this.audio.muted ? 'unmute' : 'mute');
		}
	}

	private prev(): void {
		const next = this.current <= 0 ? this.tracks.length - 1 : this.current - 1;
		this.load(next, !this.audio.paused);
	}

	private next(): void {
		const next = (this.current + 1) % this.tracks.length;
		this.load(next, !this.audio.paused);
	}

	private setStatus(text: string): void {
		if (this.statusEl) this.statusEl.textContent = text;
	}

	private setPlayGlyph(which: 'play' | 'pause'): void {
		if (this.playGlyph) {
			// ▶ (U+25B6) play; ⏸ (U+23F8) double vertical bar.
			this.playGlyph.textContent = which === 'pause' ? '⏸' : '▶';
		}
		// aria-pressed=true when the player is actively playing (button shows
		// pause glyph). aria-label flips so screen readers announce the action
		// the next click will take, not the current state.
		if (this.playBtn) {
			const playing = which === 'pause';
			this.playBtn.setAttribute('aria-pressed', String(playing));
			this.playBtn.setAttribute('aria-label', playing ? 'pause' : 'play');
		}
	}

	private renderTime(): void {
		const fmt = (s: number) => {
			if (!isFinite(s) || s < 0) return '00:00';
			const m = Math.floor(s / 60);
			const sec = Math.floor(s % 60);
			return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		};
		if (this.currentEl) this.currentEl.textContent = fmt(this.audio.currentTime);
		if (this.durationEl) this.durationEl.textContent = fmt(this.audio.duration);
		if (this.seekBar && this.audio.duration) {
			this.seekBar.value = String((this.audio.currentTime / this.audio.duration) * 100);
		}
	}
}

function init(): void {
	document.querySelectorAll<HTMLElement>('.winamp').forEach((root) => new MusicPlayer(root));
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
