import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { GridFloor, Scanlines } from './Overlays';
import { PALETTE } from './palette';

export const Boot: React.FC<{ text: string }> = ({ text }) => {
	const frame = useCurrentFrame();
	const chars = Math.min(text.length, Math.floor(frame / 3));
	const cursorOn = Math.floor(frame / 8) % 2 === 0;
	return (
		<AbsoluteFill
			style={{ backgroundColor: PALETTE.void, alignItems: 'center', justifyContent: 'center' }}
		>
			<GridFloor />
			<div
				style={{
					fontFamily: "'VCR OSD Mono', monospace",
					fontSize: 72,
					color: PALETTE.phosphor,
					textShadow: `0 0 12px ${PALETTE.phosphor}`,
					whiteSpace: 'pre',
				}}
			>
				{text.slice(0, chars)}
				<span style={{ opacity: cursorOn ? 1 : 0 }}>█</span>
			</div>
			<Scanlines />
		</AbsoluteFill>
	);
};
