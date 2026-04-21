// Per-app + default Clippy quips. The controller calls pickQuip(appId, trigger)
// to get a contextual line — falls back to the default pool if the current app
// has no override for that trigger.
//
// Add a new entry here when wiring a new app or trigger; no controller change
// required.

export type QuipTrigger = 'idle' | 'flag' | 'wakeup';

export interface QuipBank {
	default: Partial<Record<QuipTrigger, string[]>>;
	perApp: Record<string, Partial<Record<QuipTrigger, string[]>>>;
}

export const quips: QuipBank = {
	default: {
		idle: [
			'i remember when this was 1.44 MB',
			'format c: ?',
			'please insert disk 2 of 47',
			'i am still bigger than your terraform state',
			'<3 mills',
		],
		flag: [
			'nice find. very 1995 of you.',
			'flag captured. this used to be a job.',
		],
		wakeup: [
			'hi! it looks like you are visiting a personal website.',
		],
	},
	perApp: {
		trash: { idle: ["don't put me in there"] },
		terminal: { idle: ['i could be a bootloader.'] },
		flags: { idle: ["there's one inside me. probably."] },
		memes: { idle: ['kilroy was here'] },
		music: { idle: ['ask jeeves what bops are bopping today'] },
		photos: { idle: ['cats. all the way down.'] },
		mail: { idle: ['it looks like you are sending mills mail.'] },
		resume: { idle: ['my resume is just one continuous spinning hourglass.'] },
		uses: { idle: ['the chimera. i too am chimeric.'] },
		projects: { idle: ['github used to be sourceforge used to be a directory of FTP links.'] },
		about: { idle: ['it looks like you are reading about mills.'] },
	},
};

export function pickQuip(appId: string | undefined, trigger: QuipTrigger): string {
	const appBank = appId ? quips.perApp[appId] : undefined;
	const pool = appBank?.[trigger] ?? quips.default[trigger] ?? [];
	if (pool.length === 0) return '';
	return pool[Math.floor(Math.random() * pool.length)];
}
