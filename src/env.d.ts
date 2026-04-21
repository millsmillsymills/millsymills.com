/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_GIT_SHA: string;
	readonly NO_INDEX: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
