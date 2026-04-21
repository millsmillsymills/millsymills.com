// HTML-escape a string for safe interpolation into innerHTML templates.
// Covers the five characters that change parsed meaning inside element text
// or quoted attribute values: & < > " '. Use this anywhere a string literal
// from data flows into innerHTML/insertAdjacentHTML.

const ESCAPE_MAP: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}
