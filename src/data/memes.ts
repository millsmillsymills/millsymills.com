// Single source of truth for the memes gallery.
//
// Drop image files into public/images/memes/ and update the entries
// below. The gallery 404s gracefully — broken images show a fallback
// tile until the real file lands.

export interface Meme {
	readonly id: string;
	readonly src: string;
	readonly alt: string;
}

export const memes: readonly Meme[] = [
	{
		id: 'hac',
		src: '/images/memes/hac.jpg',
		alt: 'meme man, hooded, "hac"',
	},
	{
		id: 'hacker-knows-my-address',
		src: '/images/memes/hacker-knows-my-address.jpg',
		alt: 'bane and pink-suit guy: "hacker saying he knows my address" / "me who\'s known it for a long time"',
	},
	{
		id: 'hackers-name-and-address',
		src: '/images/memes/hackers-name-and-address.jpg',
		alt: 'cars (pixar): "hacker telling me my name" + "hacker telling me my address" over the king and chick hicks; bottom "me who already knew both of these" — lightning mcqueen drifting past',
	},
	{
		id: 'cyberpunk-dystopia',
		src: '/images/memes/cyberpunk-dystopia.jpg',
		alt: 'man in glowing visor and wide-brim hat: "you best start believing in cyberpunk dystopias / you\'re in one"',
	},
	{
		id: 'not-now-sweaty',
		src: '/images/memes/not-now-sweaty.png',
		alt: 'sims-style screenshot: "not now sweaty, mommy\'s cyber bullying"',
	},
	{
		id: 'cyber-warfare-experts',
		src: '/images/memes/cyber-warfare-experts.jpg',
		alt: 'futurama news show: "let\'s check in with our panel of \'experts\' on cyber warfare" — a four-up grid of cartoon panelists',
	},
	{
		id: 'esp-wroom-dab',
		src: '/images/memes/esp-wroom-dab.jpg',
		alt: 'mocked-up espressif wifi module labeled "ESP-WROOM-DAB" with both pcb antennas raised in a dab pose',
	},
	{
		id: 'cd-downloads',
		src: '/images/memes/cd-downloads.jpg',
		alt: 'three-line caption "my folder: Downloads / me: cd downloads / linux:" over loki saying "I\'ve never met this man in my life"',
	},
	{
		id: 'yolo-computer',
		src: '/images/memes/yolo-computer.jpg',
		alt: 'aura-style poster of a glowing crt: "you only live once. try to spend as much time on the computer as possible. after you die, you won\'t have access to it anymore."',
	},
	{
		id: 'me-irl',
		src: '/images/memes/me-irl.jpg',
		alt: 'romy & michele scene — woman in pastel sunhat, sunglasses, scarf and pearls at a glass-top patio table with a lavender zenith laptop and an iced tea',
	},
	{
		id: 'sailor-moon-computer',
		src: '/images/memes/sailor-moon-computer.jpg',
		alt: 'two sailor moon panels — top: "I\'ll just warn you now. I don\'t know how to use a computer." / bottom (newer art): "I should tell you, I still don\'t know how to use a computer." — caption "22 years later, still doesn\'t know how to use a Computer…"',
	},
	{
		id: 'secops-asleep',
		src: '/images/memes/secops-asleep.jpg',
		alt: 'four-panel comic — guy on phone proposes a base64 powershell loader, then drops it in %Public% via UserInitMprLogonScript; final panel a dog labeled SECOPS, asleep in bed',
	},
	{
		id: 'vpn-tunneling',
		src: '/images/memes/vpn-tunneling.jpg',
		alt: 'two tuxedoed men sharing one fishbowl space helmet, captioned "VPN Tunneling"',
	},
	{
		id: 'surf-the-web',
		src: '/images/memes/surf-the-web.jpg',
		alt: 'arthur cartoon — rat-character at a CRT, "Why, I could surf the Web all weekend!"',
	},
	{
		id: 'but-it-runs',
		src: '/images/memes/but-it-runs.jpg',
		alt: 'pirates of the caribbean three-panel — norrington: "Your code is without a doubt the worst I have ever run" / jack sparrow with a finger raised / "But it does run"',
	},
	{
		id: 'claude-my-bro',
		src: '/images/memes/claude-my-bro.jpg',
		alt: 'two anime characters in a cel-style scene — one with a wide unsettling grin handshakes another, an orange "pow" burst over the clasped hands',
	},
];
