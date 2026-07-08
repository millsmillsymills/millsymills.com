import { AbsoluteFill } from 'remotion';

import { PALETTE, type Tint } from './palette';

export const TitleCard: React.FC<{ text: string; accent: Tint }> = ({ text, accent }) => (
	<AbsoluteFill
		style={{
			backgroundColor: '#000',
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		<div
			style={{
				fontFamily: "Georgia, 'Times New Roman', serif",
				fontWeight: 700,
				fontSize: 140,
				letterSpacing: '-0.02em',
				textAlign: 'center',
				lineHeight: 1.05,
				color: accent === 'none' ? PALETTE.cream : PALETTE[accent],
				whiteSpace: 'pre-wrap',
				padding: '0 80px',
			}}
		>
			{text}
		</div>
	</AbsoluteFill>
);
