// Clippy quip bank — single file. Edits land via tiny PRs; the controller
// (`src/scripts/clippy.ts`) stays out of the loop.
//
// To add a quip: drop a `{ quip: '...' }` entry into the right pool. To
// add a trigger: extend the `QuipTrigger` union, add a default pool, and
// fire `dispatchClippyTrigger(...)` from `src/scripts/util/events.ts` at
// the user-action site. TypeScript catches typos in trigger names and
// app ids; the controller never needs touching.
//
// Voice: lowercase, terse, playful with a darker edge. Themes: matrix,
// hackers (1995), the witch, hereditary, a24 unease, last podcast on
// the left, real cybersecurity. "mills" is always lowercase.

import type { AppId } from './apps';

export type QuipTrigger =
	| 'idle'
	| 'wakeup'
	| 'open'
	| 'close'
	| 'reset'
	| 'wallpaper'
	| 'error';

export type QuipPose =
	| 'idle'
	| 'wakeup'
	| 'leave'
	| 'think'
	| 'sleep'
	| 'cool'
	| 'tired';

// `leave` is reserved for the dismiss flow — its last frame is empty so
// Clippy can walk off-screen, and the controller hides the aside afterwards.
// Using it on an in-context quip makes Clippy disappear for the leave
// duration and pop back when the auto-return-to-idle timer fires (#297).
export type QuipEntryPose = Exclude<QuipPose, 'leave'>;

export interface QuipEntry {
	readonly quip: string;
	readonly pose?: QuipEntryPose;
}

export interface QuipBank {
	default: Partial<Record<QuipTrigger, readonly QuipEntry[]>>;
	// Keys are AppIds — typo in the data file is now a TS error.
	perApp: Partial<Record<AppId, Partial<Record<QuipTrigger, readonly QuipEntry[]>>>>;
}

export const quips: QuipBank = {
	default: {
		wakeup: [
			{ quip: 'wake up, neo.' },
			{ quip: 'follow the white rabbit.' },
			{ quip: 'knock, knock.' },
			{ quip: 'hack the planet.' },
			{ quip: 'wouldst thou like to live deliciously?' },
			{ quip: 'hail yourselves.' },
			{ quip: 'i have been waiting for you.' },
		],

		idle: [
			{ quip: 'i remember when this was 1.44 MB' },
			{ quip: 'format c: ?' },
			{ quip: 'please insert disk 2 of 47' },
			{ quip: 'i am still bigger than your terraform state' },
			{ quip: '<3 mills' },
			{ quip: 'have you tried turning it off and on again.' },
			{ quip: 'rotate your secrets.' },
			{ quip: 'your s3 bucket is public again.' },
			{ quip: 'kerberoasting season is open.' },
			{ quip: "log4shell isn't dead. it's just sleeping." },
			{ quip: 'every cve has a small ghost in it.' },
			{ quip: 'the call is coming from inside the tcp/ip stack.' },
			{ quip: 'spiders georg lives in the ssh logs.' },
			{ quip: 'RISC architecture is gonna change everything.' },
			{ quip: 'this is our world now.' },
			{ quip: 'déjà vu means they changed something.' },
			{ quip: 'all kills, no fills.' },
			{ quip: 'the cosmic dread is fashionable this season.' },
			{ quip: 'ed and the bois sent regards.' },
			{ quip: 'what are we even doing here.', pose: 'tired' },
			{ quip: 'tch. tch. tch.', pose: 'tired' },
			{ quip: 'PAIMON is on call.', pose: 'tired' },
			{ quip: 'thy father bewitched my children.', pose: 'tired' },
			{ quip: 'a horse appeared. ignore the horse.' },
		],

		open: [
			{ quip: 'a new window. exciting. terrifying.' },
			{ quip: 'access granted.' },
			{ quip: 'the door is open. it was always open.' },
			{ quip: "i'll get my coat." },
		],

		close: [
			{ quip: 'goodbye, sweet window.' },
			{ quip: 'memory freed. memories not.' },
			{ quip: 'rip in pieces.' },
			{ quip: 'sealed.' },
		],

		reset: [
			{ quip: 'the void calls. you must answer.', pose: 'tired' },
			{ quip: 'are you sure you are sure.', pose: 'think' },
			{ quip: 'rm -rf is just commitment.', pose: 'think' },
			{ quip: 'wouldst thou like to start over?' },
		],

		wallpaper: [
			{ quip: 'redecorating? bold.' },
			{ quip: 'different sky. same dread.' },
			{ quip: 'the void wants the gradient.' },
			{ quip: 'good choice. the old one was haunted.', pose: 'cool' },
		],

		error: [
			{ quip: 'something broke. probably you.', pose: 'tired' },
			{ quip: 'the call is coming from inside the stack trace.', pose: 'tired' },
			{ quip: 'every error has a small ghost in it.', pose: 'tired' },
			{ quip: 'sorry. it me.', pose: 'tired' },
		],
	},

	perApp: {
		welcome: {
			open: [
				{ quip: 'it looks like you are trying to enter the desktop. need a hand?', pose: 'wakeup' },
				{ quip: 'first time? double-click anything. nothing here bites.', pose: 'cool' },
				{ quip: 'i used to do this for a living, you know.' },
			],
			idle: [
				{ quip: 'press ? for the shortcuts. or just click around.' },
				{ quip: 'every icon is a door. go on.' },
			],
		},

		trash: {
			idle: [
				{ quip: "don't put me in there" },
				{ quip: 'i was promised deep storage. not a grave.' },
				{ quip: 'the shovel is in the closet.' },
				{ quip: 'every file in here was loved once.' },
			],
		},

		terminal: {
			idle: [
				{ quip: 'i could be a bootloader.' },
				{ quip: 'there is no spoon.' },
				{ quip: 'this is just CGI sand. ignore the wizard.' },
				{ quip: 'the prompt knows what you did.', pose: 'tired' },
				{ quip: 'ed and the bois are on the line.' },
				{ quip: 'try `nmap`. very 1995 of you.' },
			],
		},

		memes: {
			idle: [
				{ quip: 'kilroy was here' },
				{ quip: 'the cursed image gallery is open.' },
				{ quip: 'every meme is a small ritual.' },
			],
		},

		music: {
			idle: [
				{ quip: 'ask jeeves what bops are bopping today' },
				{ quip: 'the algorithm wants you to feel something.' },
				{ quip: 'play it again, sam. and again. and again.' },
			],
		},

		photos: {
			idle: [
				{ quip: 'cats. all the way down.' },
				{ quip: 'everyone in this photo is dead. except the cats.' },
				{ quip: 'exif is forever.' },
			],
		},

		mail: {
			idle: [
				{ quip: 'it looks like you are sending mills mail.' },
				{ quip: 'cc: PAIMON.' },
				{ quip: 'an email is just a curse with deliverability.' },
			],
		},

		resume: {
			idle: [
				{ quip: 'my resume is just one continuous spinning hourglass.' },
				{ quip: '13 years. one cv. the math checks out.' },
				{ quip: "i can fix it. don't worry about it." },
			],
		},

		uses: {
			idle: [
				{ quip: 'the chimera. i too am chimeric.' },
				{ quip: 'the rack hums softly. it knows things.' },
			],
		},

		projects: {
			idle: [
				{ quip: 'github used to be sourceforge used to be a directory of FTP links.' },
				{ quip: 'every project is the same project.' },
			],
		},

		about: {
			idle: [
				{ quip: 'it looks like you are reading about mills.' },
				{ quip: '13 years of prying open systems. occupational hazard.' },
			],
		},

		incidents: {
			idle: [
				{ quip: 'true crime, but make it cve.' },
				{ quip: 'all kills. no fills.' },
				{ quip: 'the postmortem is the punchline.' },
				{ quip: 'every incident has a small ghost in it.', pose: 'tired' },
			],
		},

		security: {
			idle: [
				{ quip: 'every claim cites the implementation. like a real source.' },
				{ quip: "i've audited better. and worse." },
				{ quip: 'DNSSEC chains rattle in the night.' },
			],
		},

		privacy: {
			idle: [
				{ quip: 'no cookies. no tracking. no soul.' },
				{ quip: "we don't store you. we barely store ourselves." },
			],
		},

		display: {
			// `wallpaper` (above, in default) fires on tile click; `idle`
			// fires when the picker sits open. Keep these distinct or
			// wallpaper-themed lines drift between two homes.
			idle: [
				{ quip: 'pick one. they all judge you.' },
				{ quip: 'the picker remembers every choice you almost made.' },
				{ quip: 'wallpaper as personality. classic.' },
			],
		},

		vscode: {
			idle: [
				{ quip: 'real dotfiles. real fingerprints.' },
				{ quip: 'view-source is the oldest magic.' },
			],
		},
	},
};

// Module-local: track the last-shown quip per trigger so we don't repeat
// the same line twice in a row within a session. Pools are small enough
// (4-25 entries) that users notice repeats fast; this keeps the surprise.
const lastShown: Partial<Record<QuipTrigger, string>> = {};

export function pickQuip(
	appId: AppId | undefined,
	trigger: QuipTrigger,
): QuipEntry | null {
	const appBank = appId ? quips.perApp[appId] : undefined;
	const pool = appBank?.[trigger] ?? quips.default[trigger];
	if (!pool || pool.length === 0) return null;
	const last = lastShown[trigger];
	const candidates =
		pool.length > 1 && last
			? pool.filter((e) => e.quip !== last)
			: pool;
	const entry = candidates[Math.floor(Math.random() * candidates.length)];
	if (!entry) return null;
	lastShown[trigger] = entry.quip;
	return entry;
}
