import { expect, test } from 'vitest';
import { gradeCsp } from './inspector-csp';
const controls = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
test('style inline does not weaken script grade', () => {
	expect(gradeCsp(`script-src 'self'; style-src 'self' 'unsafe-inline'; ${controls}`).grade).toBe('A');
});
test.each(["script-src 'unsafe-inline'", "default-src 'unsafe-inline'", "script-src 'none'; script-src-elem 'unsafe-inline'", "script-src 'none'; script-src-attr 'unsafe-inline'"])('effective script inline is downgraded: %s', policy => {
	expect(gradeCsp(`${policy}; ${controls}`).grade).toBe('C');
});
test('first duplicate wins and directive names are case insensitive', () => {
	expect(gradeCsp(`SCRIPT-SRC 'self'; script-src 'unsafe-inline'; ${controls}`).grade).toBe('A');
});
test('nonce suppresses unsafe-inline for script elements', () => {
	expect(gradeCsp(`script-src 'unsafe-inline' 'nonce-YWJjZA=='; script-src-attr 'none'; ${controls}`).grade).toBe('A');
});
test('missing policy fails', () => expect(gradeCsp(null).grade).toBe('F'));
