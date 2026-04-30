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
 */

class MobileShell {
	private root: HTMLElement;
	private home: HTMLElement;
	private appView: HTMLElement;
	private chromeTitle: HTMLElement;
	private apps: Map<string, HTMLElement> = new Map();

	constructor(root: HTMLElement) {
		this.root = root;
		this.home = root.querySelector<HTMLElement>('.mshell__home')!;
		this.appView = root.querySelector<HTMLElement>('.mshell__app-view')!;
		this.chromeTitle = root.querySelector<HTMLElement>('.mshell__chrome-title')!;

		root.querySelectorAll<HTMLElement>('[data-mobile-app]').forEach((el) => {
			const id = el.dataset.mobileApp;
			if (id) this.apps.set(id, el);
		});

		this.bindLaunchers();
		this.bindBack();
		this.bindClock();
		window.addEventListener('popstate', (e) => {
			const next = (e.state as { current?: string | null } | null)?.current ?? null;
			this.show(next, /* fromPop */ true);
		});

		let initial: string | null = null;
		const bodyInitial = document.body?.dataset.initialOpen;
		if (bodyInitial) {
			initial = bodyInitial;
		} else {
			try {
				const requested = new URLSearchParams(window.location.search).get('open');
				if (requested) initial = requested.split(',')[0]?.trim() ?? null;
			} catch (err) {
				console.warn('[mills.mobile] failed to read ?open= query param', err);
			}
		}
		this.show(initial, /* fromPop */ true);
	}

	private bindLaunchers(): void {
		this.home.querySelectorAll<HTMLButtonElement>('[data-open-app]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const id = btn.dataset.openApp;
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

	private show(appId: string | null, fromPop = false): void {
		this.apps.forEach((el) => (el.hidden = true));

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
		document.body.classList.add('mshell-app-open');

		const launcher = this.home.querySelector<HTMLElement>(`[data-open-app="${appId}"]`);
		const title = launcher?.dataset.title ?? appId;
		this.chromeTitle.textContent = title;
		this.appView.scrollTop = 0;

		if (!fromPop) history.pushState({ current: appId }, '', location.pathname);
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
