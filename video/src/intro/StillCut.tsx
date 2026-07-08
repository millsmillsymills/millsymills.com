import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';

import { PALETTE, type Tint } from './palette';

export const StillCut: React.FC<{ src: string; tint: Tint; zoom?: boolean }> = ({
	src,
	tint,
	zoom,
}) => {
	const frame = useCurrentFrame();
	const scale = zoom ? 1 + frame * 0.0015 : 1;
	return (
		<AbsoluteFill style={{ backgroundColor: '#000' }}>
			<Img
				src={staticFile(src)}
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					filter:
						tint === 'none'
							? 'contrast(1.15)'
							: 'grayscale(1) contrast(1.4) brightness(0.9)',
					transform: `scale(${scale})`,
				}}
			/>
			{tint !== 'none' ? (
				<AbsoluteFill style={{ backgroundColor: PALETTE[tint], mixBlendMode: 'multiply' }} />
			) : null}
			{tint !== 'none' ? (
				<AbsoluteFill
					style={{ backgroundColor: PALETTE[tint], mixBlendMode: 'soft-light', opacity: 0.5 }}
				/>
			) : null}
		</AbsoluteFill>
	);
};
