// Co-operative namespace: each writer owns its own keys and merges via
// `Object.assign(window.mills ??= {}, ...)`. Encoding the known keys
// makes typos compile errors at every read and write site. Adding a new
// key requires extending this interface — small friction in exchange
// for typo safety.
import type { ChallengeId, FlagState, SubmitResult } from '../scripts/flags';
import type { ResetOptions } from '../scripts/reset';

interface MillsNamespace {
	flag?: {
		submit: (raw: string) => Promise<SubmitResult>;
		status: () => FlagState;
		capture: (id: ChallengeId) => boolean;
	};
	reset?: (opts?: ResetOptions) => void;
	__resetInit?: true;
	__clippyInit?: true;
}

// Minimal Trusted Types surface — only what trusted-types.ts touches.
// lib.dom under the current TS target omits these; remove this block if a
// future lib bump adds them (duplicate-identifier error will flag it).
interface TrustedTypePolicyOptions {
	createScriptURL?: (input: string) => string;
}
interface TrustedTypePolicy {
	readonly name: string;
}
interface TrustedTypePolicyFactory {
	createPolicy(name: string, options: TrustedTypePolicyOptions): TrustedTypePolicy;
	readonly defaultPolicy: TrustedTypePolicy | null;
}

declare global {
	interface Window {
		mills?: MillsNamespace;
		trustedTypes?: TrustedTypePolicyFactory;
	}
}

export {};
