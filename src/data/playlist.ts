// Single source of truth for the music player.
//
// Drop audio files into public/audio/ and update the `src` paths below.
// Until then the player gracefully shows a "no track" state when files
// 404. License + attribution should live alongside whatever you ship.

export interface Track {
	id: string;
	title: string;
	artist: string;
	src: string;
}

export const playlist: Track[] = [
	{
		id: 'placeholder-1',
		title: '(track 1 placeholder)',
		artist: 'mills',
		src: '/audio/track-1.mp3',
	},
	{
		id: 'placeholder-2',
		title: '(track 2 placeholder)',
		artist: 'mills',
		src: '/audio/track-2.mp3',
	},
];
