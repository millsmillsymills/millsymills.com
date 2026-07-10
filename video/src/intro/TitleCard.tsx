import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { flicker } from './crt';
import { Grain, Scanlines } from './Overlays';
import { PALETTE, type Accent } from './palette';

export const TitleCard: React.FC<{ eyebrow: string; text: string; accent: Accent }> = ({
	eyebrow,
	text,
	accent,
}) => {
	const frame = useCurrentFrame();
	const a = PALETTE[accent];
	// hard slam: 2 frames oversized, rgb split relaxes after
	const scale = frame < 2 ? 1.06 : 1;
	const split = frame < 4 ? 10 : 4;
	return (
		<AbsoluteFill
			style={{
				backgroundColor: PALETTE.void,
				alignItems: 'center',
				justifyContent: 'center',
				opacity: flicker(frame, text.length),
			}}
		>
			<div style={{ transform: `scale(${scale})`, textAlign: 'center', padding: '0 120px' }}>
				<div
					style={{
						fontFamily: "'Press Start 2P', monospace",
						fontSize: 24,
						letterSpacing: '0.12em',
						color: a,
						textShadow: `0 0 10px ${a}`,
						marginBottom: 48,
					}}
				>
					{eyebrow}
				</div>
				<div
					style={{
						fontFamily: "'Press Start 2P', monospace",
						fontSize: 64,
						lineHeight: 1.5,
						color: PALETTE.fg,
						textShadow: `${split}px 0 ${PALETTE.magenta}, ${-split}px 0 ${PALETTE.cyan}, 0 0 18px ${a}`,
					}}
				>
					{text}
				</div>
			</div>
			<Scanlines />
			<Grain />
		</AbsoluteFill>
	);
};
