/*
 * Toggle the per-row viewer pane for items inside trash.exe.
 *
 * External module so the production CSP `script-src 'self'` allows it —
 * see #129/#231.
 */

function init(): void {
	document.querySelectorAll<HTMLElement>('[data-trash-target]').forEach((row) => {
		// Each Trash component renders both on Desktop and inside MobileFallback,
		// so getElementById would collide. Find the sibling viewer relative to
		// this row's enclosing list.
		const list = row.closest<HTMLElement>('ul.trash__list');
		const viewer = list?.nextElementSibling as HTMLElement | null;
		if (!viewer || !viewer.matches('.trash__viewer')) return;
		const toggle = () => {
			viewer.hidden = !viewer.hidden;
			if (!viewer.hidden) viewer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		};
		row.addEventListener('click', toggle);
		row.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});
	});
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
}

export {};
