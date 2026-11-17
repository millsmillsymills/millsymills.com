export function gradeCsp(v: string | null): { header: string; grade: 'A' | 'B' | 'C' | 'F'; value: string } {
	const header = 'Content-Security-Policy';
	if (!v) return { header, grade: 'F', value: '(missing)' };
	// CSP uses the first occurrence of a directive; style permissions do
	// not grant script permission. Account for the script-specific fallbacks.
	const directives = new Map<string, string[]>();
	for (const part of v.split(';')) {
		const [name, ...values] = part.trim().split(/\s+/);
		if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values);
	}
	const script = directives.get('script-src') ?? directives.get('default-src') ?? [];
	const elements = directives.get('script-src-elem') ?? script;
	const attributes = directives.get('script-src-attr') ?? script;
	const allowsInline = (sources: string[]) => sources.includes("'unsafe-inline'") &&
		!sources.some(source => /^'(?:nonce-|sha(?:256|384|512)-)/i.test(source));
	const hasUnsafeInline = allowsInline(elements) || allowsInline(attributes);
	const hasObjectNone = directives.get('object-src')?.join(' ') === "'none'";
	const hasBaseSelf = directives.get('base-uri')?.join(' ') === "'self'";
	const hasFrameAnc = directives.has('frame-ancestors');
	const hasUpgrade = directives.has('upgrade-insecure-requests');
	const score = [hasObjectNone, hasBaseSelf, hasFrameAnc, hasUpgrade].filter(Boolean).length;
	if (hasUnsafeInline) return { header, grade: 'C', value: v };
	if (score === 4) return { header, grade: 'A', value: v };
	if (score >= 2) return { header, grade: 'B', value: v };
	return { header, grade: 'C', value: v };
}

