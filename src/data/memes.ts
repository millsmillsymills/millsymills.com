// Single source of truth for the memes gallery.
//
// Drop image files into public/images/memes/ and update the entries
// below. The gallery 404s gracefully — broken images show a fallback
// tile until the real file lands.

export interface Meme {
	id: string;
	src: string;
	alt: string;
	caption: string;
}

export const memes: Meme[] = [
	{
		id: 'hac',
		src: '/images/memes/hac.jpg',
		alt: 'meme man, hooded, "hac"',
		caption: 'hac',
	},
	// add more as you collect them
];
