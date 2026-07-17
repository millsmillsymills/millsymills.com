export const FPS = 30;

// Seconds into track.mp3 where frame 0 lands. The track's energy collapses
// at ~90s (volumedetect: ~-20 dB through 55-90s, -29.5 dB at 90s, silence by
// 95s), so the 30s cut starts four 98-BPM bars before the old 70.57s downbeat
// and ends on the collapse, under the final-frames volume fade.
export const TRACK_OFFSET_SEC = 60.77;
