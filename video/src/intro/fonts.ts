import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

const FACES = [
	{ family: 'Tr2n', file: 'fonts/Tr2n.ttf' },
	{ family: 'Press Start 2P', file: 'fonts/PressStart2P.ttf' },
	{ family: 'VCR OSD Mono', file: 'fonts/VCR_OSD_MONO.ttf' },
] as const;

const handle = delayRender('intro fonts');

Promise.all(
	FACES.map(async ({ family, file }) => {
		const face = new FontFace(family, `url('${staticFile(file)}') format('truetype')`);
		await face.load();
		document.fonts.add(face);
	}),
).then(
	() => continueRender(handle),
	(err: unknown) => cancelRender(err),
);
