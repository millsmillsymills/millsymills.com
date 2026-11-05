import { afterEach, expect, it, vi } from 'vitest';
import { reconcileAppActivity, subscribeAppActivity } from './app-activity';
let mobile = false;
const controllers: AbortController[] = [];
function subscribe(id: string) {
	vi.stubGlobal('matchMedia', () => ({ matches: mobile }));
	const controller = new AbortController();
	controllers.push(controller);
	const listener = vi.fn();
	subscribeAppActivity(id, listener, controller.signal);
	return listener;
}
afterEach(() => {
	controllers.splice(0).forEach((controller) => controller.abort());
	mobile = false;
	reconcileAppActivity('desktop', []);
	vi.unstubAllGlobals();
});
it('ignores inactive shells, deduplicates selection and keeps other desktop apps active', () => {
	const listener = subscribe('music');
	reconcileAppActivity('mobile', ['music'], 'music');
	expect(listener).not.toHaveBeenCalled();
	reconcileAppActivity('desktop', ['music'], 'music');
	reconcileAppActivity('desktop', ['music', 'about'], 'about');
	reconcileAppActivity('desktop', ['music'], 'music');
	expect(listener.mock.calls).toEqual([[{ active: true, userGesture: true }]]);
	reconcileAppActivity('desktop', []);
	reconcileAppActivity('desktop', []);
	expect(listener).toHaveBeenCalledTimes(2);
	expect(listener).toHaveBeenLastCalledWith({ active: false, userGesture: false });
});
it('preserves continuing activity across breakpoints and replays without gesture credit', () => {
	const first = subscribe('music');
	reconcileAppActivity('desktop', ['music'], 'music');
	mobile = true;
	reconcileAppActivity('mobile', ['music']);
	expect(first).toHaveBeenCalledTimes(1);
	const late = subscribe('music');
	expect(late).toHaveBeenCalledExactlyOnceWith({ active: true, userGesture: false });
	reconcileAppActivity('mobile', []);
	expect(first).toHaveBeenCalledTimes(2);
});
