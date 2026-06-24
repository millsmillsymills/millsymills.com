/*
 * Mobile-shell controller — phone-OS metaphor.
 *
 * Two states: home (icon grid) and app (full-screen view of one app).
 * Tap a launcher icon -> open that app. Tap the back chevron in the
 * mobile chrome -> back to home. Browser back button works via the
 * History API so the OS-level swipe-back gesture also returns home.
 *
 * Top-level loads of `/` always show the home grid. A per-app permalink
 * (server-rendered <body data-initial-open="...">) or an explicit
 * `?open=<id>` query param can override that. Cross-session persistence
 * is intentionally not used — landing visitors on an app they happened
 * to open last week makes the homepage look like that app's "coming
 * soon" body, not the launcher.
 *
 * Bodies are server-rendered exactly once, inside the corresponding
 * Desktop window (see #519). On the mobile breakpoint we move each
 * body's DOM into the matching `[data-mobile-app]` container; on resize
 * past 768px we move it back. The breakpoint matches the CSS rule in
 * `desktop.css` that toggles `.desktop` vs `.mshell` visibility.
 */

const MOBILE_MQL = '(max-width: 768px)';

class MobileShell {
	private root: HTMLElement;
	private home: HTMLElement;
	private appView: HTMLElement;
	private chromeTitle: HTMLElement;
	private apps: Map<string, HTMLElement> = new Map();
	private mql: MediaQueryList;
	private transplanted = false;

	constructor(root: HTMLElement) {
		this.root = root;
		this.home = root.querySelector<HTMLElement>('.mshell__home')!;
		this.appView = root.querySelector<HTMLElement>('.mshell__app-view')!;
		this.chromeTitle = root.querySelector<HTMLElement>('.mshell__chrome-title')!;

		root.querySelectorAll<HTMLElement>('[data-mobile-app]').forEach((el) => {
			const id = el.dataset['mobileApp'];
			if (id) this.apps.set(id, el);
		});

		this.bindLaunchers();
		this.bindBack();
		this.bindClock();
		window.addEventListener('popstate', (e) => {
			const next = (e.state as { current?: string | null } | null)?.current ?? null;
			this.show(next, /* fromPop */ true);
		});

		this.mql = window.matchMedia(MOBILE_MQL);
		this.applyBreakpoint();
		this.mql.addEventListener('change', () => this.applyBreakpoint());

		let initial: string | null = null;
		const bodyInitial = document.body?.dataset['initialOpen'];
		if (bodyInitial) {
			initial = bodyInitial;
		} else {
			try {
				const requested = new URLSearchParams(window.location.search).get('open');
				if (requested) initial = requested.split(',')[0]?.trim() ?? null;
			} catch (err) {
				console.warn('[mills.mobile] failed to read ?open= query param', err);
			}
			if (!initial && this.mql.matches) initial = this.firstVisitWelcome();
		}
		this.show(initial, /* fromPop */ true);
	}

	// First arrival opens the welcome app once. The flag is shared with the
	// desktop window-manager, but only the active surface's controller ever
	// touches it (window-manager skips on the mobile breakpoint), so the
	// two can't race to burn it. Storage-blocked browsers degrade to
	// "always show". Callers must confirm the mobile breakpoint first.
	private firstVisitWelcome(): string | null {
		const KEY = 'mills.welcome.seen';
		try {
			if (localStorage.getItem(KEY) === '1') return null;
		} catch (err) {
			console.warn('[mills.mobile] welcome flag read failed', err);
		}
		try {
			localStorage.setItem(KEY, '1');
		} catch (err) {
			console.warn('[mills.mobile] welcome flag write failed', err);
		}
		return 'welcome';
	}

	private bindLaunchers(): void {
		this.home.querySelectorAll<HTMLButtonElement>('[data-open-app]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const id = btn.dataset['openApp'];
				if (id) this.show(id);
			});
		});
	}

	private bindBack(): void {
		const back = this.root.querySelector<HTMLButtonElement>('.mshell__chrome-back');
		back?.addEventListener('click', () => this.show(null));
	}

	private bindClock(): void {
		const clock = this.root.querySelector<HTMLElement>('.mshell__clock');
		if (!clock) return;
		const tick = () => {
			const d = new Date();
			const hh = d.getHours().toString().padStart(2, '0');
			const mm = d.getMinutes().toString().padStart(2, '0');
			clock.textContent = `${hh}:${mm}`;
		};
		tick();
		setInterval(tick, 30_000);
	}

	private applyBreakpoint(): void {
		if (this.mql.matches && !this.transplanted) {
			this.transplant('to-mobile');
			this.transplanted = true;
		} else if (!this.mql.matches && this.transplanted) {
			this.transplant('to-desktop');
			this.transplanted = false;
		}
	}

	private transplant(direction: 'to-mobile' | 'to-desktop'): void {
		this.apps.forEach((mobileContainer, id) => {
			const winBody = document.querySelector<HTMLElement>(
				`section.window[data-window-id="${CSS.escape(id)}"] .window__body`,
			);
			if (!winBody) return;
			const [from, to] =
				direction === 'to-mobile' ? [winBody, mobileContainer] : [mobileContainer, winBody];
			while (from.firstChild) {
				to.appendChild(from.firstChild);
			}
		});
	}

	private show(appId: string | null, fromPop = false): void {
		this.apps.forEach((el, id) => {
			el.hidden = true;
			this.syncDesktopWindowHidden(id, true);
		});

		if (!appId) {
			this.home.hidden = false;
			this.appView.hidden = true;
			document.body.classList.remove('mshell-app-open');
			if (!fromPop) history.pushState({ current: null }, '', location.pathname);
			return;
		}

		const app = this.apps.get(appId);
		if (!app) {
			this.show(null, fromPop);
			return;
		}

		this.home.hidden = true;
		this.appView.hidden = false;
		app.hidden = false;
		// Mirror the open state onto the corresponding Desktop window's
		// `hidden` attr so scripts watching window-manager's canonical
		// "this app just opened" signal (e.g. inspector.exe's
		// MutationObserver on `[data-window-id="inspector"]`) also fire
		// on mobile. The window is `display:none` via CSS at this
		// breakpoint, so the flip has no visual effect — it's purely
		// the signalling channel.
		this.syncDesktopWindowHidden(appId, false);
		document.body.classList.add('mshell-app-open');

		const launcher = this.home.querySelector<HTMLElement>(`[data-open-app="${appId}"]`);
		const title = launcher?.dataset['title'] ?? appId;
		this.chromeTitle.textContent = title;
		this.appView.scrollTop = 0;

		if (!fromPop) history.pushState({ current: appId }, '', location.pathname);

		this.scrollToHashIn(app);
	}

	private syncDesktopWindowHidden(appId: string, hidden: boolean): void {
		const win = document.querySelector<HTMLElement>(
			`section.window[data-window-id="${CSS.escape(appId)}"]`,
		);
		if (!win) return;
		win.hidden = hidden;
	}

	private scrollToHashIn(container: HTMLElement): void {
		const hash = location.hash;
		if (!hash || hash.length < 2) return;
		let target: Element | null;
		try {
			target = container.querySelector(`#${CSS.escape(hash.slice(1))}`);
		} catch {
			return;
		}
		if (target) {
			requestAnimationFrame(() => target!.scrollIntoView({ block: 'start' }));
		}
	}
}

function init(): void {
	const root = document.querySelector<HTMLElement>('.mshell');
	if (!root) return;
	new MobileShell(root);
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
