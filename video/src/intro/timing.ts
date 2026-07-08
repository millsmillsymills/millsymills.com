export const FPS = 30;

// Tuned by ear against assets/track.mp3 in `npm run studio` (Task 2, step 2.4).
export const BPM = 128;

// Seconds into track.mp3 where beat 0 of the cut lands (which slice of the
// 123s track the 15s intro uses). Tuned in step 2.4.
export const TRACK_OFFSET_SEC = 0;

export function beatToFrame(beat: number): number {
	return Math.round((beat * 60 * FPS) / BPM);
}
