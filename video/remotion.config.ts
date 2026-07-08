import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// staticFile() resolves against this directory; track.mp3 and noise.png
// live in assets/, not the Remotion default of public/.
Config.setPublicDir('assets');
