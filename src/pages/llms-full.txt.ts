import type { APIRoute } from 'astro';
import { coreSkills, experience, photos, profile } from '../data/profile';
import { projects } from '../data/projects';
import {
	CATEGORY_LABELS,
	securityControls,
	type ControlCategory,
} from '../data/security-controls';

// The data-backed sections are interpolated from the typed data files so
// this surface can no longer drift from them (#838). Hand-written prose
// remains inline for the sections with no typed source (terminal, war
// stories, tech stack, legal).

function aboutSection(): string {
	return `## about

${profile.name} (\`${profile.handle}\`). Pronouns: ${profile.pronouns}.
Based in ${profile.location.replace(' · ', ' and works ')}.
${profile.title} at ${profile.currentEmployer}.

Certifications: ${profile.certifications.join(', ')}.

Short bio: ${profile.summary}

Contact: <mailto:${profile.email}>. GitHub: <${profile.github}>.`;
}

function skillsSection(): string {
	const groups = coreSkills
		.map((g) => `- ${g.group} — ${g.items.join(', ')}.`)
		.join('\n');
	return `### core skills\n\n${groups}`;
}

function experienceSection(): string {
	const roles = experience
		.map((e) => `- ${e.title} — ${e.company} (${e.period}).`)
		.join('\n');
	return `### experience\n\n${roles}`;
}

function projectsSection(): string {
	const lines = projects
		.map((p) => {
			const demo = p.demoUrl ? ` Live demo at ${p.demoUrl}.` : '';
			return `- ${p.name} — ${p.tagline}.${demo}\n  <${p.repo}>`;
		})
		.join('\n');
	return `## projects

Open source, across github.com/millsmillsymills and the
millsymills-com GitHub org:

${lines}`;
}

function photosSection(): string {
	const alts = photos.map((p) => `- ${p.alt}`).join('\n');
	return `## photos

A small gallery of cat photos — ${photos.length} shots, each with
descriptive alt text:

${alts}`;
}

function securitySection(): string {
	const shipped = securityControls.filter((c) => c.status === 'shipped');
	const roadmap = securityControls.filter((c) => c.status === 'roadmap');
	const categories = Object.keys(CATEGORY_LABELS) as ControlCategory[];
	const byCategory = categories
		.map((cat) => {
			const titles = shipped.filter((c) => c.category === cat).map((c) => c.title);
			return titles.length > 0 ? `- ${CATEGORY_LABELS[cat]}: ${titles.join('; ')}.` : null;
		})
		.filter((line) => line !== null)
		.join('\n');
	const roadmapLine =
		roadmap.length > 0
			? `Roadmap (tracked, not yet shipped): ${roadmap.map((c) => c.title).join('; ')}.`
			: 'Roadmap: empty — every tracked control has shipped.';
	return `## security

Shipped security controls — full registry with what/why/tradeoffs and
code links lives at <https://millsymills.com/security/> and is rendered
from the typed data file \`src/data/security-controls.ts\` (as is this
section). Controls by category:

${byCategory}

${roadmapLine}`;
}

function body(): string {
	return `# mills — full site content

This is the full serialized content of <https://millsymills.com>
as markdown, intended for LLM consumption. The canonical HTML UI
is a Y2K-pink retro desktop with draggable windows; this file is
the content behind it, flattened.

---

${aboutSection()}

---

## resume (summary)

Full resume markdown: <https://millsymills.com/files/resume.md>.

${skillsSection()}

${experienceSection()}

### notable war stories

- Patched a Zoom RCE 0-day with a custom mitigation 8 hours
  before the vendor released their fix.
- Solved an internal hardware theft case by correlating MAC
  address movement across Meraki access points with RADIUS
  logs, video feeds, and badge access logs.
- Performed an emergency data exfiltration for a VIP whose
  beachfront Florida office was about to be destroyed by
  Hurricane Irma. Beat the storm.
- Hot-swapped a Zoom environment from Okta's pre-built
  integration to a custom SAML integration with zero downtime,
  zero complaints, and no lost data.
- Replaced a $50k/year SOC-as-a-service vendor with n8n
  automations and enriched Slack alerts.
- Managed intelligence sharing between organizations targeted
  by ELUSIVE COMET; hardened endpoints against Zoom remote-
  control social-engineering attacks and authored the
  public blog post.

---

${projectsSection()}

---

${photosSection()}

---

## terminal

A mock zsh-ish REPL embedded as an app window. Commands:

- \`help\`, \`man <cmd>\`, \`whoami\`, \`pwd\`, \`cd\`, \`ls\`, \`cat\`,
  \`echo\`, \`clear\`, \`history\`, \`date\`, \`exit\`.
- \`ifconfig\`, \`ping <host>\`, \`nmap [target|subnet]\`,
  \`curl <url>\`, \`ssh <user>@<host>\`.
- \`sudo <cmd>\` — accepts the word "password" as password (on
  purpose).
- \`fortune\`, \`cowsay\`, \`uname\`, hidden \`sl\`.

Fake /24 subnet at 192.168.1.0 with 5 hosts.

Terminal is desktop-only; phones without real keyboards get a
friendly stub.

---

## mail

Contact the human: <mailto:${profile.email}>. Open an
issue or PR on the repo: <${profile.github}>.

---

${securitySection()}

## tech stack / infrastructure

- Frontend: Astro 6, static output. No JS frameworks for app
  logic; small vanilla-TS modules for window management,
  terminal REPL, mobile shell, music player,
  boot animation.
- Hosting: AWS S3 + CloudFront (with OAC + CloudFront Function
  for \`/path/\` → \`/path/index.html\` rewriting) + Route53 + ACM.
- Email: ProtonMail custom-domain with SPF, DKIM (three
  selectors), DMARC \`p=reject; adkim=s; aspf=s\`.
- Infra: Terraform with S3 state (encrypt + use_lockfile) and
  GitHub-Actions OIDC deploy role.
- CI/CD: \`./scripts/ci-local.sh\` mirrors the hosted workflow
  step-for-step.
- License: MIT.

---

## legal

Copyright (c) 2026 mills. Released under the MIT License.
See <https://github.com/millsmillsymills/millsymills.com/blob/main/LICENSE>.
`;
}

export const GET: APIRoute = ({ site }) => {
	if (!site) {
		throw new Error('llms-full.txt: Astro.site is undefined. Check astro.config.mjs site value.');
	}
	const origin = site.href.replace(/\/$/, '');
	const rendered = body().replaceAll('https://millsymills.com', origin);

	return new Response(rendered, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
