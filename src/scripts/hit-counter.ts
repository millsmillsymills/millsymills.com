/*
 * Hit-counter taskbar widget. Fires one fetch against /api/hits per
 * page load to increment + read the global counter, then renders the
 * count next to the pixel asset.
 *
 * Failure mode: leave the `--` placeholder in place. No retry, no
 * exponential backoff, no error UI -- a broken counter is worth
 * exactly the bytes it costs to show a dash.
 *
 * Backend: see `infra/hitcounter.tf` (DynamoDB UpdateItem with ADD).
 */

interface HitsResponse {
	count: number;
	ts: string;
}

function format(count: number): string {
	// Locale-aware grouping for readability: 1,234,567 not 1234567.
	// Falls back to the integer string if Intl is unavailable.
	try {
		return new Intl.NumberFormat('en-US').format(count);
	} catch {
		return String(count);
	}
}

async function fetchHits(): Promise<void> {
	const container = document.querySelector<HTMLElement>('[data-hit-counter]');
	const value = document.querySelector<HTMLElement>(
		'[data-hit-counter-value]',
	);
	if (!container || !value) return;
	try {
		const res = await fetch('/api/hits', {
			method: 'GET',
			credentials: 'omit',
			cache: 'no-store',
		});
		if (!res.ok) return;
		const data = (await res.json()) as HitsResponse;
		if (typeof data?.count !== 'number') return;
		const formatted = format(data.count);
		value.textContent = formatted;
		container.setAttribute('aria-label', `page hits: ${formatted}`);
	} catch {
		// Swallow -- placeholder stays.
	}
}

if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', fetchHits);
	} else {
		void fetchHits();
	}
}

export {};
