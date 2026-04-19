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
  description = "GitHub repo (owner/name) allowed to assume the deploy role via OIDC."
  type        = string
  default     = "millsmillsymills/millsymills.com"
}

variable "deploy_branch" {
  description = "Git branch on `github_repo` that is allowed to assume the deploy role."
  type        = string
  default     = "main"
}
