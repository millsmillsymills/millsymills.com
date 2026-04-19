variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "Root domain name"
  type        = string
  default     = "millsymills.com"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to assume the deploy role via OIDC. No default: forks must set this explicitly so the deploy role can't be trivially assumed by the upstream repo."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repo))
    error_message = "github_repo must be in `owner/name` form (e.g. `millsmillsymills/millsymills.com`)."
  }
}

variable "deploy_branch" {
  description = "Git branch on `github_repo` that is allowed to assume the deploy role."
  type        = string
  default     = "main"
}

variable "protonmail_verification_token" {
  description = "ProtonMail domain-verification token (from Proton admin after adding the domain). Blank means email is not yet active: DNS deploys null MX + sender-free SPF so the domain is unspoofable."
  type        = string
  default     = ""
  sensitive   = true
}

variable "protonmail_dkim_selectors" {
  description = "ProtonMail DKIM selector -> CNAME target, e.g. { protonmail = \"protonmail.domainkey.abcdef.domains.proton.ch.\" }. Populate after Proton verifies the domain."
  type        = map(string)
  default     = {}
}

variable "dmarc_report_address" {
  description = "Mailbox that receives DMARC aggregate reports (rua). Leave blank to default to `dmarc@<var.domain>`. Configure the chosen address as an address or alias in ProtonMail."
  type        = string
  default     = ""
}
