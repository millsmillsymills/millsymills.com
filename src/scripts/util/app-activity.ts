// Resource lifetime follows the visible shell, independently of DOM placement.
// Reconciliation is synchronous so launcher gestures retain autoplay eligibility.
import { dispatchWindowClosed, dispatchWindowOpen } from './events';

export const MOBILE_QUERY = '(max-width: 768px)';
const active = new Set<string>();
export type AppActivity = { active: boolean; userGesture: boolean };

export function reconcileAppActivity(
	surface: 'desktop' | 'mobile',
	ids: Iterable<string>,
	gestureId?: string,
): void {
	const mobile = window.matchMedia(MOBILE_QUERY).matches;
	if ((surface === 'mobile') !== mobile) return;
	const next = new Set(ids);
	const closed = [...active].filter((id) => !next.has(id));
	const opened = [...next].filter((id) => !active.has(id));
	// Commit before notifying, so subscribers always see the new snapshot.
	active.clear();
	for (const id of next) active.add(id);
	for (const id of closed) dispatchWindowClosed(id);
	for (const id of opened) dispatchWindowOpen(id, id === gestureId);
}

// Replay current activity for subscribers initialized after shell restoration.
// A replay is never a new user gesture.
export function subscribeAppActivity(
	id: string,
	listener: (activity: AppActivity) => void,
	signal?: AbortSignal,
): void {
	if (signal?.aborted) return;
	window.addEventListener('mills:window-open', (event) => {
		if (event.detail.id === id) listener({ active: true, userGesture: event.detail.userGesture });
	}, signal ? { signal } : undefined);
	window.addEventListener('mills:window-closed', (event) => {
		if (event.detail.id === id) listener({ active: false, userGesture: false });
	}, signal ? { signal } : undefined);
	if (active.has(id)) listener({ active: true, userGesture: false });
}
