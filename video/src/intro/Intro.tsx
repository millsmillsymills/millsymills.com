import {
	AbsoluteFill,
	Html5Audio,
	interpolate,
	Sequence,
	staticFile,
	useVideoConfig,
} from 'remotion';

import { Grain } from './Grain';
import { PlaceholderStill } from './PlaceholderStill';
import { SHOTS } from './shots';
import { StillCut } from './StillCut';
import { beatToFrame, TRACK_OFFSET_SEC } from './timing';
import { TitleCard } from './TitleCard';

function shotElement(shot: (typeof SHOTS)[number]): React.ReactElement {
	if (shot.kind === 'title') return <TitleCard text={shot.text} accent={shot.accent ?? 'none'} />;
	if (shot.kind === 'placeholder') return <PlaceholderStill tint={shot.tint} />;
	return <StillCut src={shot.src} tint={shot.tint ?? 'none'} zoom={shot.zoom ?? false} />;
}

export const Intro: React.FC = () => {
	const { durationInFrames, fps } = useVideoConfig();

	let beat = 0;
	const sequences = SHOTS.map((shot, i) => {
		const from = beatToFrame(beat);
		const durationFrames = beatToFrame(beat + shot.beats) - from;
		beat += shot.beats;
		return (
			<Sequence key={i} from={from} durationInFrames={durationFrames}>
				{shotElement(shot)}
			</Sequence>
		);
	});

	return (
		<AbsoluteFill style={{ backgroundColor: '#000' }}>
			{sequences}
			<Grain />
			<Html5Audio
				src={staticFile('track.mp3')}
				trimBefore={Math.round(TRACK_OFFSET_SEC * fps)}
				volume={(f) =>
					interpolate(f, [durationInFrames - 20, durationInFrames - 2], [1, 0], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					})
				}
			/>
		</AbsoluteFill>
	);
};
