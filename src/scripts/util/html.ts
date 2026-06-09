// Serialize a JSON-compatible value for safe embedding inside an inline
// <script> element (e.g. JSON-LD). `JSON.stringify` does not escape `<`, `>`,
// or `&`, so an unescaped `</script>`, `<!--`, or `-->` substring slipping into
// any string field would terminate the script element early and leave the
// remainder as live HTML — a parser-confusion XSS. Escaping those bytes to
// JSON unicode escapes preserves the parsed value while making script-element
// breakout impossible. U+2028 / U+2029 are also escaped because JSON allows
// them as raw bytes inside string literals but legacy JavaScript engines treat
// them as line terminators (ES2019 fixed this; cheap defense for older parsers).
export function serializeJsonForScript(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
