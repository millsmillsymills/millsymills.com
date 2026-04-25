/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_GIT_SHA: string;
	readonly NO_INDEX: string;
	/** Recent commits captured at build time; baked in as a literal array via Vite define. */
	readonly PUBLIC_GIT_LOG: ReadonlyArray<{ hash: string; subject: string; dateIso: string }>;
	/** Encrypted mail-form address + PoW manifest, baked at build time. See astro.config.mjs. */
	readonly PUBLIC_MAIL_POW: { readonly salt: string; readonly difficultyBits: number; readonly encryptedB64: string };
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module '*?raw' {
	const content: string;
	export default content;
}
