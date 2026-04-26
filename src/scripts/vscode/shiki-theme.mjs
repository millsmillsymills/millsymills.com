/**
 * Hand-rolled shiki theme keyed off the neon-noir palette in
 * `src/styles/desktop.css :root`. Built so vscode.exe's editor pane
 * inherits the same hot-pink / cyan / lilac vocabulary the rest of the
 * desktop chrome speaks — stock dark themes (dracula, vitesse-dark)
 * land close but always read as "someone else's theme dropped into our
 * site." This one feels native.
 *
 * Background is `transparent` on purpose: the editor pane already
 * paints `--bg-raised`, and letting that token govern means a future
 * palette tweak in `desktop.css` ripples into the editor without
 * touching this file.
 *
 * If you add a token category here (e.g. regex, decorators), add the
 * corresponding `tokenColors` scope and use a token that already
 * exists in `desktop.css` rather than introducing a new hex literal.
 */

export const neonNoirTheme = {
	name: 'neon-noir',
	type: 'dark',
	colors: {
		'editor.background': '#00000000',
		'editor.foreground': '#f5edff',
	},
	tokenColors: [
		// Comments — muted lilac, reads as background chatter.
		{
			scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
			settings: { foreground: '#8a6bb8', fontStyle: 'italic' },
		},
		// Keywords (if, return, const, function, etc.) — hot pink, the most active token class.
		{
			scope: [
				'keyword',
				'storage.type',
				'storage.modifier',
				'keyword.control',
				'keyword.operator.new',
				'keyword.operator.expression',
			],
			settings: { foreground: '#ff4fa8' },
		},
		// Strings — cyan; high-frequency token so we use the softer hi shade.
		{
			scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
			settings: { foreground: '#66f0ff' },
		},
		// Template-string interpolations stay distinguishable from the surrounding string.
		{
			scope: ['meta.template.expression', 'punctuation.definition.template-expression'],
			settings: { foreground: '#ff7ec0' },
		},
		// Numbers, booleans, null/undefined — bright cyan.
		{
			scope: ['constant.numeric', 'constant.language', 'constant.language.boolean', 'constant.language.null'],
			settings: { foreground: '#00e5ff' },
		},
		// Other constants (ALL_CAPS, enum members) — pink, distinct from numbers.
		{
			scope: ['constant.other', 'variable.other.constant', 'entity.name.constant'],
			settings: { foreground: '#ff7ec0' },
		},
		// Function names — bright pink, the headline token in any code listing.
		{
			scope: [
				'entity.name.function',
				'support.function',
				'meta.function-call entity.name.function',
				'variable.function',
			],
			settings: { foreground: '#ff7ec0' },
		},
		// Types, classes, interfaces — lilac, the "shape" tokens.
		{
			scope: [
				'entity.name.type',
				'entity.name.class',
				'entity.name.interface',
				'support.type',
				'support.class',
				'meta.type.annotation entity.name.type',
			],
			settings: { foreground: '#c8a8ff' },
		},
		// Variables — primary ink, the default reading colour.
		{
			scope: ['variable', 'variable.other', 'variable.parameter'],
			settings: { foreground: '#f5edff' },
		},
		// Properties / attribute names (object keys, html attributes) — lilac.
		{
			scope: [
				'meta.object-literal.key',
				'support.type.property-name',
				'entity.other.attribute-name',
				'variable.other.property',
			],
			settings: { foreground: '#c8a8ff' },
		},
		// Tags (jsx/astro/html elements) — hot pink; their attributes are lilac (rule above).
		{
			scope: [
				'entity.name.tag',
				'support.class.component',
				'meta.tag entity.name.tag',
				'punctuation.definition.tag',
			],
			settings: { foreground: '#ff4fa8' },
		},
		// Operators / punctuation — primary ink so they don't compete.
		{
			scope: ['keyword.operator', 'punctuation.separator', 'punctuation.terminator'],
			settings: { foreground: '#c8a8ff' },
		},
		// Markdown headings + emphasis — pink + lilac, structurally distinct from prose.
		{ scope: ['markup.heading', 'entity.name.section.markdown'], settings: { foreground: '#ff4fa8', fontStyle: 'bold' } },
		{ scope: ['markup.bold'], settings: { foreground: '#ff7ec0', fontStyle: 'bold' } },
		{ scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
		{ scope: ['markup.inline.raw', 'markup.fenced_code'], settings: { foreground: '#66f0ff' } },
		{ scope: ['markup.underline.link', 'string.other.link'], settings: { foreground: '#00e5ff' } },
		// Shell — distinguish builtins from variables.
		{ scope: ['support.function.builtin.shell'], settings: { foreground: '#ff4fa8' } },
		{ scope: ['variable.other.normal.shell', 'variable.parameter.positional.shell'], settings: { foreground: '#c8a8ff' } },
		// INI-style configs (.tmux.conf, git/config) — section headers + keys.
		{ scope: ['entity.name.section', 'keyword.other.definition.ini'], settings: { foreground: '#ff4fa8' } },
		{ scope: ['variable.other.section', 'support.type.property-name.ini'], settings: { foreground: '#c8a8ff' } },
	],
};
