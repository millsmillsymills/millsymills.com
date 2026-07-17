import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { steps } from './crt';
import { GridFloor, Scanlines } from './Overlays';
import { PALETTE } from './palette';
import { STILLS, type StillId } from './sequence';

export const StillCut: React.FC<{
	still: StillId;
	zoom?: number | undefined;
	flash?: boolean | undefined;
}> = ({ still, zoom = 1.1, flash = false }) => {
	const frame = useCurrentFrame();
	const { src, cutout } = STILLS[still];
	const scale = zoom + steps(interpolate(frame, [0, 15], [0, 0.06]), 8);
	const flashOpacity = flash
		? interpolate(frame, [0, 3], [1, 0], { extrapolateRight: 'clamp' })
		: 0;
	return (
		<AbsoluteFill style={{ backgroundColor: PALETTE.void }}>
			{cutout ? <GridFloor /> : null}
			<Img
				src={staticFile(src)}
				style={{
					width: '100%',
					height: '100%',
					objectFit: cutout ? 'contain' : 'cover',
					objectPosition: cutout ? '50% 0%' : '50% 20%',
					transform: `scale(${scale})`,
					transformOrigin: '50% 20%',
				}}
			/>
			<Scanlines />
			{flash ? <AbsoluteFill style={{ backgroundColor: PALETTE.fg, opacity: flashOpacity }} /> : null}
		</AbsoluteFill>
	);
};

export const Strobe: React.FC<{ stills: readonly StillId[]; framesPer: number }> = ({
	stills,
	framesPer,
}) => {
	const frame = useCurrentFrame();
	const still = stills[Math.floor(frame / framesPer) % stills.length];
	return still === undefined ? null : <StillCut still={still} zoom={1.2} />;
};
