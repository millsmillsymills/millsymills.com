import { describe, expect, it } from 'vitest';
import { escapeHtml, serializeJsonForScript } from './html';

describe('escapeHtml', () => {
	it('escapes the five HTML-significant characters', () => {
		expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
	});

	it('round-trips ordinary text untouched', () => {
		expect(escapeHtml('hello world 42')).toBe('hello world 42');
	});
});

describe('serializeJsonForScript', () => {
	it('produces JSON that round-trips back to the original value', () => {
		const value = { a: 1, b: 'two', c: [3, 4], d: { e: null } };
		expect(JSON.parse(serializeJsonForScript(value))).toEqual(value);
	});

	it('escapes a literal `</script>` so it cannot terminate the script element', () => {
		const value = { payload: 'oops</script><script>alert(1)</script>' };
		const serialized = serializeJsonForScript(value);
		expect(serialized.toLowerCase()).not.toContain('</script>');
		expect(JSON.parse(serialized)).toEqual(value);
	});

	it('escapes html-comment delimiters that would also confuse the parser', () => {
		const value = { payload: '<!-- x -->' };
		const serialized = serializeJsonForScript(value);
		expect(serialized).not.toContain('<!--');
		expect(serialized).not.toContain('-->');
		expect(JSON.parse(serialized)).toEqual(value);
	});

	it('escapes `<`, `>`, `&` to JSON unicode escapes', () => {
		const value = { s: '<>&' };
		expect(serializeJsonForScript(value)).toBe('{"s":"\\u003c\\u003e\\u0026"}');
	});

	it('escapes U+2028 and U+2029 line separators', () => {
		const value = { s: '\u2028\u2029' };
		const serialized = serializeJsonForScript(value);
		expect(serialized).not.toMatch(/[\u2028\u2029]/);
		expect(JSON.parse(serialized)).toEqual(value);
	});
});
