import { register } from '../registry';
import { resetAll } from '../../reset';

register({
	name: 'reset',
	summary: 'wipe all client-side state (windows, flags, history)',
	usage: 'reset',
	handler: ({ out }) => {
		out('this will clear:', 't-dim');
		out('  · open windows + saved positions');
		out('  · captured CTF flags (all of them)');
		out('  · last-open mobile app');
		out('  · boot-animation skip');
		out('');
		out('confirm in the modal (or cancel).');
		// triggers the modal flow on the page
		resetAll();
	},
});
