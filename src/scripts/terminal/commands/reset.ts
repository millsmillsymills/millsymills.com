import { register } from '../registry';
import { resetAll } from '../../reset';

register({
	name: 'reset',
	summary: 'wipe all client-side state (windows, history)',
	usage: 'reset',
	handler: ({ out }) => {
		const modal = document.querySelector('.reset-confirm');
		if (!modal) {
			out('reset: confirm modal not found on this page', 't-err');
			return;
		}
		out('this will clear:', 't-dim');
		out('  · open windows + saved positions');
		out('  · last-open mobile app');
		out('  · boot-animation skip');
		out('');
		out('confirm in the modal (or cancel).');
		out('focus is in the modal — press Esc or click Cancel to back out.', 't-dim');
		resetAll();
	},
});
