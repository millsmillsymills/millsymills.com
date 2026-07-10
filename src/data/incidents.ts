/*
 * Incident wall. Real IR / response stories mills has personally worked.
 *
 * NDA-safe content only. Voice is terse, lowercase, Y2K-pink — annotations
 * read like debriefs, not resume bullets. Titles also lowercase (except
 * proper-noun codenames like ELUSIVE COMET). Sort newest first; the
 * component renders in array order.
 *
 * `employer` must exactly match a `company` value in `profile.ts` experience
 * entries; `year` must fall inside that role's tenure. The resume is the
 * source of truth for mills' location during each incident — it lives on the
 * matching experience entry (profile.ts `location`). Set `offsite` only when
 * the incident itself took place at a non-default location (e.g., a client
 * site); mills' own response location is still the role's `location`.
 */

import type { Employer } from './profile';

export type Severity = 'info' | 'low' | 'med' | 'high' | 'critical';

export interface Incident {
	year: number;
	severity: Severity;
	employer: Employer;
	cve?: string;
	title: string;
	annotation: string;
	offsite?: string;
	link?: { label: string; href: string };
}

export const incidents: Incident[] = [
	{
		year: 2025,
		severity: 'high',
		employer: 'Trail of Bits',
		title: 'ELUSIVE COMET',
		annotation:
			'cross-org intel sharing on an active campaign using zoom remote-control as a social-engineering primitive. hardened the endpoint fleet against it and coauthored the public writeup. the win was collective — sharing indicators and screenshots across several targeted orgs before the vendor shipped their own hardening.',
		link: {
			label: 'trail of bits blog',
			href: 'https://blog.trailofbits.com/2025/04/17/mitigating-elusive-comet-zoom-remote-control-attacks/',
		},
	},
	{
		year: 2017,
		severity: 'high',
		employer: 'Commonwealth Financial Network',
		title: 'zoom RCE 0-day — custom mitigation 8h before vendor',
		annotation:
			'beat the vendor by eight hours. wrote + deployed a custom mitigation blocking the known exploit path fleet-wide before zoom shipped the official patch. FINRA/SEC-regulated environment — no room for lucky timing.',
	},
	{
		year: 2017,
		severity: 'info',
		employer: 'Commonwealth Financial Network',
		title: 'hurricane irma — emergency data exfil',
		annotation:
			"VIP had a beachfront florida office about to be taken out by irma. racing the eyewall, pulled everything to the cloud, clean shutdown, boarded up. beat the storm. not a security incident per se — an IT-ops one — but unforgettable.",
		offsite: "VIP's beachfront office, Florida (mills coordinating from the San Diego office)",
	},
	{
		year: 2016,
		severity: 'high',
		employer: 'Commonwealth Financial Network',
		title: 'rogue client — keylogger + firewall creds via social eng',
		annotation:
			'client deployed keyloggers on workstations, then socially engineered a level-1 technician into handing over firewall credentials. rotated everything, rebuilt the trust boundary, wrote up the incident, and locked down the escalation path so L1 couldn\'t hand out creds to callers claiming to be "from the home office."',
	},
	{
		year: 2015,
		severity: 'med',
		employer: 'Commonwealth Financial Network',
		title: 'hardware theft solved via MAC correlation',
		annotation:
			'laptop walked off. correlated MAC address movement across meraki access points with RADIUS logs, building badge readers, and camera feeds. caught it. fun bit of multi-source forensics in a FINRA/SEC-regulated shop.',
	},
	{
		year: 2014,
		severity: 'med',
		employer: 'Commonwealth Financial Network',
		title: 'poweliks + cryptolocker wave',
		annotation:
			'two of the era-defining commodity malware families, handled back-to-back under FINRA/SEC compliance. playbooks got sharper each round. reminder that "commodity" doesn\'t mean "cheap to respond to."',
	},
];
