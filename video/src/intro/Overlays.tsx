import { AbsoluteFill, staticFile } from 'remotion';

export const Scanlines: React.FC = () => (
	<AbsoluteFill
		style={{
			backgroundImage: `url(${staticFile('textures/scanlines.svg')})`,
			mixBlendMode: 'multiply',
		}}
	/>
);

export const Grain: React.FC = () => (
	<AbsoluteFill
		style={{
			backgroundImage: `url(${staticFile('textures/grain.svg')})`,
			opacity: 0.5,
		}}
	/>
);

export const GridFloor: React.FC = () => (
	<AbsoluteFill style={{ backgroundImage: `url(${staticFile('textures/grid-floor.svg')})` }} />
);
