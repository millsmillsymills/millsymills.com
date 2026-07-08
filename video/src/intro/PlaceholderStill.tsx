import { AbsoluteFill } from 'remotion';

import { PALETTE, type Tint } from './palette';

export const PlaceholderStill: React.FC<{ tint: Exclude<Tint, 'none'> }> = ({ tint }) => (
	<AbsoluteFill
		style={{
			background:
				tint === 'cyan'
					? `linear-gradient(135deg, ${PALETTE.deep}, ${PALETTE.cyan})`
					: `linear-gradient(135deg, ${PALETTE.void}, ${PALETTE.pink})`,
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		<div
			style={{
				fontFamily: "Georgia, 'Times New Roman', serif",
				fontSize: 220,
				fontWeight: 700,
				color: 'rgba(0, 0, 0, 0.35)',
			}}
		>
			mills
		</div>
	</AbsoluteFill>
);
