# Andrew Mills

A+ | Network+ | Security+ | CEH
he/him | Seattle, WA | remote
mills@millsymills.com | github.com/millsmillsymills | github.com/millsymills-com | millsymills.com

## Professional Summary

Corporate Security Engineer with 10+ years in IT and security, specializing in
identity and access management, endpoint security, and security automation.
Experienced administrator of Okta, Google Workspace, and Azure AD/Entra ID;
implements SSO/SAML and SCIM provisioning and automates identity lifecycle
workflows. Manages large device fleets with Jamf and CrowdStrike, and builds
custom compliance programs for HIPAA, CMMC, SSPA, and others. Increasingly
focused on replacing costly vendor functionality with infrastructure-as-code,
supply-chain hardening, and AI/agent tooling: managing cloud and a GitHub
org with Terraform/OpenTofu, publishing an open-source MCP server suite, and
administering enterprise Claude Code, including config hardening, guardrail
hooks, and authored skills.

## Core Skills

- Identity & Access Management: Okta, Google Workspace, Azure AD/Entra ID,
  SSO/SAML, SCIM provisioning, LDAPS, identity lifecycle
- Endpoint & Device Security: Jamf, CrowdStrike Falcon, Google
  Context-Aware Access, fleet administration
- Zero Trust & Network Access: Tailscale (ZTNA), 802.1X/RADIUS, Conditional
  Access, VLAN segmentation
- Scripting & Automation: Python, Bash, Terraform, Docker/Compose, n8n,
  Slack workflows, cron, CI/CD, Google Cloud Run, AWS Lambda
- Infrastructure-as-Code: Terraform & OpenTofu (AWS + GitHub providers),
  GitHub org-as-code, GitHub Actions OIDC, S3/CloudFront/Route53/ACM, DNSSEC,
  MTA-STS, branch/tag-protection rulesets as code, tofu test
- Supply Chain & Dependency Security: release-age cooldowns, exact version
  pinning, hash-verified installs, blocked install-time scripts, Dependabot
  cooldowns, OCP-SAFE
- AI & Agent Tooling: Claude Code (enterprise admin + dev), Codex, Gemini,
  Cursor, LM Studio (local models); MCP server development, Claude Code skill
  authoring, agent guardrails/hooks, cross-repo consistency auditing

## Selected Projects & Open Source

### millsymills.com · personal site on fully Terraform-managed AWS

- Astro static site served from a private S3 bucket fronted by CloudFront
  (HTTPS, security headers, directory-index rewrite), with Route53 (apex +
  www, IPv4/IPv6), ACM, DNSSEC, CAA, MTA-STS, and Certificate Transparency
  monitoring, all defined in Terraform.
- Deploys via GitHub Actions using OIDC with no long-lived AWS credentials;
  the trust boundary pins the OIDC sub and job_workflow_ref to a specific
  workflow file and branch, backed by a tightly-scoped IAM role.
- Manages ProtonMail custom-domain email DNS (SPF/DKIM/DMARC) as code, and
  runs a monthly scheduled deploy so the security.txt 12-month Expires field
  can't silently go stale.

### millsymills-com-org · GitHub org-as-code

- Manages the millsymills-com GitHub organization as code with OpenTofu:
  org and per-repo baselines, default-branch and tag-protection rulesets, all
  as reusable modules with native tofu test coverage.
- PR-driven and OIDC-enforced: plan on PR, drift detection on schedule, and
  apply gated behind a verified-commits check, with no long-lived credentials.
- Ships a security-focused CI stack on the org repo itself: CodeQL, gitleaks,
  OSSF Scorecard, zizmor, and actionlint.

### MCP server suite + consistency-check

- Built and maintain six open-source Model Context Protocol (MCP) servers:
  five Python (unifi, unraid, gandi, shortcut, flipperzero) and one Go
  (protonmail), exposing home-lab and SaaS APIs to AI agents, including a
  three-tier safety model that gates write and purchase operations.
- Authored consistency-check, a canonical-standards audit tool that scans
  every server against versioned rule IDs (Python, Go, MCP-protocol, CI,
  security, tests, and more) and idempotently files GitHub issues for MUST
  violations, keeping the fleet consistent as it grows.

### claude-defaults · agent configuration & skills

- Authored Claude Code skills and a shareable agent-configuration baseline:
  sandboxing, permission policy, MCP defaults, and PreToolUse guardrail hooks
  that block destructive commands and pushes to main and warn on
  sensitive-path writes. Distributed via an idempotent, reversible installer.

## Professional Experience

### Corporate Security Engineer · Trail of Bits · 2023 – present · Seattle, WA (remote)

- Planned and executed migration of 150+ host fleet from SimpleMDM to Jamf.
- Built identity lifecycle workflows for onboarding, offboarding, and
  access auditing using Bash, Python, and Slack integrations.
- Replaced an expensive SOC-as-a-service vendor with n8n automations,
  enriched Slack alerts, and one-click incident response workflows
  ($50k annual savings).
- Hardened the software supply chain across internal tooling: release-age
  cooldowns (uv / pnpm minimumReleaseAge), exact version pinning,
  hash-verified installs, blocked install-time (postinstall) scripts, and
  cooldown-gated, grouped Dependabot updates.
- Administer Claude Code for the organization: usage and rate-limit
  monitoring, enterprise configuration hardening, and privacy/security
  reviews of plugins, connectors, and new features before rollout.
- Authored PreToolUse guardrail hooks for the agent fleet that block
  dangerous commands (e.g. rm -rf) and prevent sensitive-information
  disclosure.
- Managed intelligence sharing between organizations targeted by ELUSIVE
  COMET. Hardened endpoints against Zoom remote-control social engineering
  attacks and authored the associated blog post.
- Developed and maintained compliance frameworks for Microsoft SSPA, CMMC,
  UK Cyber Essentials, and OCP-SAFE. Worked with project managers and
  clients on security questionnaires.
- Administered Tailscale ZTNA, managing tailnets, exit nodes, and access
  policies for remote connectivity.
- Tested all internal security tooling personally before fleet rollout
  (package security scanners, NIST 800-88 cryptographic erasure tools)
  through staged environments. Filed bugs, gave feedback, broke things on
  purpose.
- Provided billable corporate IT and security consultancy directly to
  clients.
- Administered Google Workspace and CrowdStrike Falcon, and managed internal
  infrastructure as code with Terraform.

### Associate Security Consultant · Leviathan Security Group · 2022 – 2023 · Seattle, WA (remote)

- Discovered and cataloged vulnerabilities in customer environments.
- Prioritized vulnerabilities and provided mitigation instructions.
- Met with clients to set expectations and present findings.
- Created custom tooling to speed up engagement onboarding for other
  consultants.

### Security Architect · RealSelf · 2017 – 2022 · Seattle, WA (in-office through 2020, remote 2020–2022)

- Owned the vendor vetting program and Risk Register, working with
  procurement and business stakeholders to evaluate third-party security
  and privacy risks.
- Identified and modeled threats to production users, internal employees,
  and third-party vendors.
- Created a Security Ambassador program so non-technical and engineering
  teams could adopt secure practices without top-down mandates.
- Built and maintained program metrics including active vulnerability
  tracking, security silo scoring, and impact-scored future work.
- Led a team to build HaveIBeenPwned credential-checking functionality
  into an AWS Lambda using Terraform. Took it from planning to production.
- Administered Okta, Google Workspace, and Azure AD/Entra ID: SSO
  integrations, MFA enforcement, SCIM provisioning, LDAPS, and access
  controls for internal and SaaS applications.
- Hot-swapped the Zoom environment from Okta's pre-built integration to a
  custom SAML integration with zero downtime, zero complaints, and no
  lost data.
- Planned, staged, and rolled out 802.1X and RADIUS authentication using
  Entra ID for RBAC. Migrated 300 clients across 2 VLANs to a 12-VLAN
  environment automated with PowerShell.
- Built Security Awareness Training program from the ground up, including
  HIPAA-specific training and executive-targeted curricula.
- Deployed an AWS-based Wazuh SIEM with host agents for threat hunting,
  plus open-source honeypots for network intrusion detection.
- Managed Jamf endpoint fleet and Meraki network infrastructure.
- Ran an internal "Hacktoberfest" security month with guest speakers,
  offensive training, and a company-wide CTF.
- Migrated bug bounty program from HackerOne to Bugcrowd. Handled triage
  and management.
- Moved asset management from a spreadsheet to an AWS-hosted Snipe-IT
  instance.

### Level 3 Support Engineer · Commonwealth Financial Network · 2013 – 2017 · San Diego, CA (in-office)

- Final escalation point for 50+ Level 1 and Level 2 technicians in a
  FINRA/SEC-regulated environment.
- Worked with Compliance and Information Security teams on audit findings
  and security policy improvements.
- Mitigated active security incidents including Poweliks and Cryptolocker
  infections under FINRA/SEC compliance requirements; insider threats
  involving social engineering and unauthorized hardware; and a Zoom RCE
  0-day patched 8 hours before the vendor released their fix.
- Solved an internal hardware theft case by correlating MAC address
  movement across Meraki access points with RADIUS logs, video feeds, and
  badge access logs.
- Handled a rogue client who deployed keyloggers and used social
  engineering to obtain firewall credentials from a Level 1 technician.
- Performed an emergency data exfiltration for a VIP who couldn't reach
  their beachfront office in Florida before Hurricane Irma made landfall
  and destroyed it.

## Skills (full list)

- Cloud: AWS, Azure, GCP, DigitalOcean, fly.io, Docker, VMWare Horizon
- Server: Windows Server, Linux Server
- Network & Firewall: Checkpoint, Meraki, Ubiquiti, RADIUS, Windows
  Network Policy
- IAM: Active Directory, Entra, Okta, Google Workspace
- Endpoint Protection: CrowdStrike Falcon, Symantec Endpoint, Symantec DLP,
  Proofpoint, Material Security, Wazuh, OpenCanary
- Pentest: Burp Suite, Wireshark, network penetration, web app testing,
  Bugcrowd
- SIEM: Splunk, CloudWatch, ELK
- Compliance: HIPAA, GDPR/CCPA, SSPA, CMMC, UK Cyber Essentials, OCP-SAFE
- Scripting: Python, PowerShell, Bash
- AI: Claude Code (admin + dev), Codex, Google Gemini, Cursor, LM Studio
  (local models); MCP server development, skill authoring; OpenAI (admin)
- DevOps: GitHub Enterprise, GitLab
- Productivity: JAMF, Snipe-IT, Jira, Google Workspace, Adobe CC,
  WordPress, DNSimple
