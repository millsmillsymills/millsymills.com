import { Composition } from 'remotion';

import { Intro } from './intro/Intro';
import { beatToFrame, FPS } from './intro/timing';
import { totalBeats } from './intro/shots';

export const Root: React.FC = () => (
	<Composition
		id="intro"
		component={Intro}
		durationInFrames={beatToFrame(totalBeats())}
		fps={FPS}
		width={1920}
		height={1080}
	/>
);
