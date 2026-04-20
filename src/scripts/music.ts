/*
 * Music player controller for the winamp.exe window.
 *
 * Wires the rendered controls + playlist to a single <audio> element.
 * Handles missing audio files gracefully — clicking play on a 404
 * shows "track unavailable" rather than crashing.
 */

interface Track {
	id: string;
	src: string;
	title: string;
	artist: string;
}

class MusicPlayer {
	private audio: HTMLAudioElement;
	private tracks: Track[] = [];
	private current = -1;

	private titleEl: HTMLElement | null;
	private artistEl: HTMLElement | null;
	private currentEl: HTMLElement | null;
	private durationEl: HTMLElement | null;
	private statusEl: HTMLElement | null;
	private playBtn: HTMLButtonElement | null;
	private muteBtn: HTMLButtonElement | null;
	private seekBar: HTMLInputElement | null;

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
		this.audio.addEventListener('play', () => this.setStatus('playing', '⏸'));
		this.audio.addEventListener('pause', () => this.setStatus('paused', '▶'));
		this.audio.addEventListener('error', () => {
			this.setStatus('track unavailable');
			if (this.titleEl) this.titleEl.textContent = '(404 — drop audio into public/audio/)';
		});
	}

	private load(i: number, autoplay = false): void {
		if (i < 0 || i >= this.tracks.length) return;
		this.current = i;
		const track = this.tracks[i];
		this.audio.src = track.src;
		if (this.titleEl) this.titleEl.textContent = track.title;
		if (this.artistEl) this.artistEl.textContent = track.artist;
		this.refreshTrackHighlight();
		if (autoplay) this.audio.play().catch(() => this.setStatus('cannot play'));
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
		if (this.audio.paused) this.audio.play().catch(() => this.setStatus('cannot play'));
		else this.audio.pause();
	}

	private toggleMute(): void {
		this.audio.muted = !this.audio.muted;
		if (this.muteBtn) this.muteBtn.textContent = this.audio.muted ? '🔇' : '🔊';
	}

	private prev(): void {
		const next = this.current <= 0 ? this.tracks.length - 1 : this.current - 1;
		this.load(next, !this.audio.paused);
	}

	private next(): void {
		const next = (this.current + 1) % this.tracks.length;
		this.load(next, !this.audio.paused);
	}

	private setStatus(text: string, playGlyph?: string): void {
		if (this.statusEl) this.statusEl.textContent = text;
		if (playGlyph && this.playBtn) this.playBtn.textContent = playGlyph;
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
