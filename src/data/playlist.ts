// Single source of truth for the music player.
//
// Audio files live in public/audio/ as track-NN.m4a.

export interface Track {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly src: string;
}

export const playlist: readonly Track[] = [
	{
		id: 't01',
		title: 'ＶＨＳ 追憶',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-01.m4a',
	},
	{
		id: 't02',
		title: 'Connected 接続',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-02.m4a',
	},
	{
		id: 't03',
		title: 'Exchanging Glances プロムナード',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-03.m4a',
	},
	{
		id: 't04',
		title: '夢ＣＡＳＩＮＯ',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-04.m4a',
	},
	{
		id: 't05',
		title: 'One Wish',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-05.m4a',
	},
	{
		id: 't06',
		title: 'Loversランデブー',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-06.m4a',
	},
	{
		id: 't07',
		title: 'ｙｏｕｒ ｔｏｕｃｈ',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-07.m4a',
	},
	{
		id: 't08',
		title: 'ＭＩＫＩＭＯＴＯミキモト',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-08.m4a',
	},
	{
		id: 't09',
		title: '全くELEGANCE',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-09.m4a',
	},
	{
		id: 't10',
		title: '火曜日 (Don\'t Worry)',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-10.m4a',
	},
	{
		id: 't11',
		title: 'HOTELプラザラウンジ',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-11.m4a',
	},
	{
		id: 't12',
		title: 'WITH~YOU',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-12.m4a',
	},
	{
		id: 't13',
		title: 'レブロンLUXURY',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-13.m4a',
	},
	{
		id: 't14',
		title: 'Fleeting Moments',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-14.m4a',
	},
	{
		id: 't15',
		title: 'ｇｌｏｗｉｎｇ アベニュー',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-15.m4a',
	},
	{
		id: 't16',
		title: 'SWATCH材料見本',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-16.m4a',
	},
	{
		id: 't17',
		title: '1991 ダッジステルス (Commercial Break)',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-17.m4a',
	},
	{
		id: 't18',
		title: 'Made Man (Cocaine & Caviar)',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-18.m4a',
	},
	{
		id: 't19',
		title: 'ｆｅｅｌｓ ｓｏ ｇｏｏｄ',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-19.m4a',
	},
	{
		id: 't20',
		title: 'ＢＡＹＳＩＤＥ愛好家',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-20.m4a',
	},
	{
		id: 't21',
		title: 'ＮＨＫ国際ニュース',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-21.m4a',
	},
	{
		id: 't22',
		title: 'Before You Go',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-22.m4a',
	},
	{
		id: 't23',
		title: '96.5 THE WAVE FM 波',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-23.m4a',
	},
	{
		id: 't24',
		title: 'I JUST DON\'T FEEL THE SAME',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-24.m4a',
	},
	{
		id: 't25',
		title: 'In The Morning 夜明け',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-25.m4a',
	},
	{
		id: 't26',
		title: 'Like It Never Even Happened',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-26.m4a',
	},
	{
		id: 't27',
		title: 'あなたなしで (End Credits)',
		artist: '「サンセット Ｎｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-27.m4a',
	},
	{
		id: 't28',
		title: '隠蔽SHADOWS',
		artist: 'Ｗｅｓｔｅｒｎ Ｄｉｇｉｔａｌ & 「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-28.m4a',
	},
	{
		id: 't29',
		title: 'BABY愛',
		artist: 'Eeyore & 「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-29.m4a',
	},
	{
		id: 't30',
		title: 'VISA Platinum',
		artist: 'Pega 速力 & 「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-30.m4a',
	},
	{
		id: 't31',
		title: 'Singles Connection',
		artist: 'Comanche \'88 &「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-31.m4a',
	},
	{
		id: 't32',
		title: 'ＴＡＬＫ２ＭＥ',
		artist: 'ＳＵＳＰＥＣＴデジタル  &「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-32.m4a',
	},
	{
		id: 't33',
		title: 'MY LUV',
		artist: 'ＳＵＳＰＥＣＴデジタル  &「サンセット N ｅｔｗｏｒｋ❾❶」',
		src: '/audio/track-33.m4a',
	},
];
