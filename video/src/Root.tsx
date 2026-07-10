import { Composition } from 'remotion';

import { Intro } from './intro/Intro';
import { totalFrames } from './intro/sequence';
import { FPS } from './intro/timing';

export const Root: React.FC = () => (
	<Composition
		id="intro"
		component={Intro}
		durationInFrames={totalFrames()}
		fps={FPS}
		width={1920}
		height={1080}
	/>
);
