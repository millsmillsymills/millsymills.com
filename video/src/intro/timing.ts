export const FPS = 30;

// Musical pulse of assets/track.mp3 (beat-tracker reports ~196 double-time).
export const BPM = 98;

// Seconds into track.mp3 where beat 0 lands — a downbeat chosen so the
// cut ends as the track's energy collapses (~90s).
export const TRACK_OFFSET_SEC = 70.57;

export function beatToFrame(beat: number): number {
	return Math.round((beat * 60 * FPS) / BPM);
}
