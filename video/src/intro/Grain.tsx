import { AbsoluteFill, staticFile } from 'remotion';

export const Grain: React.FC = () => (
	<AbsoluteFill
		style={{
			backgroundImage: `url(${staticFile('noise.png')})`,
			backgroundRepeat: 'repeat',
			opacity: 0.12,
			pointerEvents: 'none',
		}}
	/>
);
