import {
	AbsoluteFill,
	Html5Audio,
	interpolate,
	Sequence,
	staticFile,
	useVideoConfig,
} from 'remotion';

import './fonts';
import { Boot } from './Boot';
import { Lockup } from './Lockup';
import { PALETTE } from './palette';
import { BEATS, type Beat } from './sequence';
import { StillCut, Strobe } from './StillCut';
import { TitleCard } from './TitleCard';
import { TRACK_OFFSET_SEC } from './timing';

function beatElement(beat: Beat): React.ReactElement {
	switch (beat.kind) {
		case 'boot':
			return <Boot text={beat.text} />;
		case 'card':
			return <TitleCard eyebrow={beat.eyebrow} text={beat.text} accent={beat.accent} />;
		case 'still':
			return <StillCut still={beat.still} zoom={beat.zoom} flash={beat.flash} />;
		case 'strobe':
			return <Strobe stills={beat.stills} framesPer={beat.framesPer} />;
		case 'lockup':
			return <Lockup />;
	}
}

export const Intro: React.FC = () => {
	const { durationInFrames, fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ backgroundColor: PALETTE.void }}>
			{BEATS.map((beat, i) => (
				<Sequence key={i} from={beat.from} durationInFrames={beat.dur}>
					{beatElement(beat)}
				</Sequence>
			))}
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
