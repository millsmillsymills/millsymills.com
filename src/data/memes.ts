// Single source of truth for the memes gallery.
//
// Drop image files into public/images/memes/ and update the entries
// below. The gallery 404s gracefully — broken images show a fallback
// tile until the real file lands.

export interface Meme {
	readonly id: string;
	readonly src: string;
	readonly alt: string;
	readonly caption: string;
}

export const memes: readonly Meme[] = [
	{
		id: 'hac',
		src: '/images/memes/hac.jpg',
		alt: 'meme man, hooded, "hac"',
		caption: 'hac',
	},
	{
		id: 'hacker-knows-my-address',
		src: '/images/memes/hacker-knows-my-address.jpg',
		alt: 'bane and pink-suit guy: "hacker saying he knows my address" / "me who\'s known it for a long time"',
		caption: 'threat model: realistic',
	},
	{
		id: 'cyberpunk-dystopia',
		src: '/images/memes/cyberpunk-dystopia.jpg',
		alt: 'man in glowing visor and wide-brim hat: "you best start believing in cyberpunk dystopias / you\'re in one"',
		caption: 'you\'re in one',
	},
	{
		id: 'not-now-sweaty',
		src: '/images/memes/not-now-sweaty.png',
		alt: 'sims-style screenshot: "not now sweaty, mommy\'s cyber bullying"',
		caption: 'mommy\'s cyber bullying',
	},
];
