/*
 * Trusted Types `default` policy.
 *
 * `require-trusted-types-for 'script'; trusted-types default` is enforced
 * (infra/cloudfront.tf, issue #130). Under enforce the
 * Worker script URL spawned in mail-pow.ts must be a TrustedScriptURL.
 * The browser consults a policy named `default` automatically for any
 * otherwise-unwrapped sink value, so registering one here means call sites
 * (including Vite's generated `new Worker(url)`) need no changes.
 *
 * The policy fails closed: only same-origin /_astro/ script URLs (where
 * Vite emits hashed bundles, including the PoW worker) are allowed; every
 * other script URL throws. No createHTML/createScript is defined, so HTML
 * and inline-script sinks remain blocked under enforce.
 */
export function installDefaultTrustedTypesPolicy(): void {
	const tt = window.trustedTypes;
	if (!tt || tt.defaultPolicy) return;
	tt.createPolicy('default', {
		createScriptURL(input: string): string {
			const url = new URL(input, window.location.origin);
			if (url.origin === window.location.origin && url.pathname.startsWith('/_astro/')) {
				return input;
			}
			throw new TypeError(`trusted-types: blocked script URL ${input}`);
		},
	});
}
