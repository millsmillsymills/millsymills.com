// Single source of truth for personal/profile data rendered across the desktop.

export const profile = {
	name: 'Andrew Mills',
	handle: 'mills',
	pronouns: 'he/him',
	location: 'Seattle, WA · remote',
	title: 'Corporate Security Engineer',
	currentEmployer: 'Trail of Bits',
	email: 'mills@millsymills.com',
	github: 'https://github.com/millsmillsymills',
	githubOrg: 'https://github.com/millsymills-com',
	certifications: ['A+', 'Network+', 'Security+', 'CEH'],
	summary:
		'Corporate Security Engineer with 10+ years of experience in IT and security, specializing in identity and access management, endpoint security, and security automation. Increasingly focused on replacing costly vendor functionality with infrastructure-as-code, supply-chain hardening, and AI/agent tooling: managing cloud and a GitHub org with Terraform/OpenTofu, publishing an open-source MCP server suite, and administering enterprise Claude Code — config hardening, guardrail hooks, and authored skills.',
} as const;

export const coreSkills = [
	{
		group: 'Identity & Access Management',
		items: [
			'Okta',
			'Google Workspace',
			'Azure AD / Entra ID',
			'SSO / SAML',
			'SCIM',
			'LDAPS',
			'Identity lifecycle',
		],
	},
	{
		group: 'Endpoint & Device Security',
		items: ['Jamf', 'CrowdStrike Falcon', 'Google Context-Aware Access', 'Fleet administration'],
	},
	{
		group: 'Zero Trust & Network',
		items: ['Tailscale (ZTNA)', '802.1X / RADIUS', 'Conditional Access', 'VLAN segmentation'],
	},
	{
		group: 'Scripting & Automation',
		items: [
			'Python',
			'Bash',
			'Terraform',
			'Docker / Compose',
			'n8n',
			'Slack workflows',
			'cron',
			'CI/CD',
			'Google Cloud Run',
			'AWS Lambda',
		],
	},
	{
		group: 'Infrastructure-as-Code',
		items: [
			'Terraform / OpenTofu',
			'GitHub org-as-code',
			'GitHub Actions OIDC',
			'S3 / CloudFront / Route53 / ACM',
			'DNSSEC',
			'MTA-STS',
			'Ruleset-as-code',
			'tofu test',
		],
	},
	{
		group: 'Supply Chain & Dependency Security',
		items: [
			'Release-age cooldowns',
			'Exact version pinning',
			'Hash-verified installs',
			'Blocked install-time scripts',
			'Dependabot cooldowns',
			'OCP-SAFE',
		],
	},
	{
		group: 'AI & Agent Tooling',
		items: [
			'Claude Code (enterprise admin + dev)',
			'Codex',
			'Gemini',
			'Cursor',
			'LM Studio (local models)',
			'MCP server development',
			'Skill authoring',
			'Agent guardrails / hooks',
			'Cross-repo consistency auditing',
		],
	},
] as const;

export const experience = [
	{
		title: 'Corporate Security Engineer',
		company: 'Trail of Bits',
		period: '2023 – present',
		location: 'Seattle, WA (remote)',
		bullets: [
			'Planned and executed migration of 150+ host fleet from SimpleMDM to Jamf.',
			'Built identity lifecycle workflows (onboarding, offboarding, access auditing) in Bash, Python, and Slack.',
			'Replaced a $50k/year SOC-as-a-service vendor with n8n automations, enriched Slack alerts, and one-click incident response.',
			'Hardened the software supply chain across internal tooling: release-age cooldowns, exact version pinning, hash-verified installs, blocked install-time scripts, and cooldown-gated, grouped Dependabot updates.',
			'Administer Claude Code for the organization: usage and rate-limit monitoring, enterprise configuration hardening, and privacy/security reviews of plugins, connectors, and new features before rollout.',
			'Authored PreToolUse guardrail hooks for the agent fleet that block dangerous commands (e.g. rm -rf) and prevent sensitive-information disclosure.',
			'Managed intelligence sharing between organizations targeted by ELUSIVE COMET; hardened endpoints against Zoom remote-control social-engineering attacks and authored the public blog post.',
			'Maintained compliance frameworks for Microsoft SSPA, CMMC, UK Cyber Essentials, and OCP-SAFE.',
			'Administered Tailscale ZTNA — tailnets, exit nodes, access policies for remote connectivity.',
			'Tested every internal security tool personally before fleet rollout — package security scanners, NIST 800-88 cryptographic erasure tools — through staged environments. Filed bugs, gave feedback, broke things on purpose.',
			'Provided billable corporate IT and security consultancy directly to clients.',
			'Administered Google Workspace and CrowdStrike Falcon, and managed internal infrastructure as code with Terraform.',
		],
	},
	{
		title: 'Associate Security Consultant',
		company: 'Leviathan Security Group',
		period: '2022 – 2023',
		location: 'Seattle, WA (remote)',
		bullets: [
			'Discovered and cataloged vulnerabilities in customer environments.',
			'Prioritized vulnerabilities and provided mitigation instructions.',
			'Met with clients to set expectations and present findings.',
			'Created custom tooling to speed up engagement onboarding for other consultants.',
		],
	},
	{
		title: 'Security Architect',
		company: 'RealSelf',
		period: '2017 – 2022',
		location: 'Seattle, WA (in-office through 2020, remote 2020–2022)',
		bullets: [
			'Owned the vendor vetting program and Risk Register.',
			'Threat-modeled production users, internal employees, and third-party vendors.',
			'Created a Security Ambassador program so non-technical and engineering teams could adopt secure practices without top-down mandates.',
			'Led a team to build HaveIBeenPwned credential-checking into AWS Lambda via Terraform — planning to production.',
			'Hot-swapped the Zoom environment from Okta\'s pre-built integration to a custom SAML integration with zero downtime, zero complaints, and no lost data.',
			'Planned, staged, and rolled out 802.1X + RADIUS using Entra ID for RBAC. Migrated 300 clients across 2 VLANs to a 12-VLAN environment, automated with PowerShell.',
			'Built the Security Awareness Training program from scratch — including HIPAA-specific and executive-targeted curricula.',
			'Deployed an AWS-based Wazuh SIEM with host agents for threat hunting plus open-source honeypots for intrusion detection.',
			'Ran an internal "Hacktoberfest" security month with guest speakers, offensive training, and a company-wide CTF.',
			'Migrated bug bounty program from HackerOne to Bugcrowd. Handled triage and management.',
			'Moved asset management from a spreadsheet to an AWS-hosted Snipe-IT instance.',
		],
	},
	{
		title: 'Level 3 Support Engineer',
		company: 'Commonwealth Financial Network',
		period: '2013 – 2017',
		location: 'San Diego, CA (in-office)',
		bullets: [
			'Final escalation point for 50+ Level 1 and Level 2 technicians in a FINRA/SEC-regulated environment.',
			'Mitigated active incidents — Poweliks, Cryptolocker — under FINRA/SEC compliance, plus insider threats involving social engineering and unauthorized hardware.',
			'Patched a Zoom RCE 0-day with a custom mitigation 8 hours before the vendor released their fix.',
			'Solved an internal hardware theft case by correlating MAC address movement across Meraki access points with RADIUS logs, video feeds, and badge access logs.',
			'Handled a rogue client who deployed keyloggers and used social engineering to obtain firewall credentials from a Level 1 technician.',
			'Performed an emergency data exfiltration for a VIP whose beachfront Florida office was about to be destroyed by Hurricane Irma. Beat the storm.',
		],
	},
] as const;

export type Employer = (typeof experience)[number]['company'];

export const photos = [
	{
		src: '/images/cats/tabby-fluff.jpg',
		alt: 'long-haired tabby with green eyes, looking up',
		caption: 'fluff',
	},
	{
		src: '/images/cats/kittens-pair.jpg',
		alt: 'two kittens on a couch — gray dilute calico and a smaller white-and-gray',
		caption: 'the kittens, day one',
	},
	{
		src: '/images/cats/missy.jpg',
		alt: 'long-haired tabby sitting upright in front of a brick fireplace, green eyes looking just past the camera',
		caption: 'missy, holding court',
	},
	{
		src: '/images/cats/olive.jpg',
		alt: 'gray dilute-tortoiseshell cat perched on the corner of a sofa, tail draped over the side',
		caption: 'olive on her perch',
	},
	{
		src: '/images/cats/eva.jpg',
		alt: 'long-haired gray-and-white cat sprawled belly-up on a fleece cushion in front of a wicker hamper',
		caption: 'eva, fully unbothered',
	},
] as const;
