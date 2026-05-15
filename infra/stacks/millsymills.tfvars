aws_region    = "us-west-2"
domain        = "millsymills.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# Set explicitly even though it matches the default — keeps the trust
# policy's expected value visible in the stack file rather than
# relying on a default that could shift.
deploy_environment = "production"

# ProtonMail vars — leave blank until Proton is activated.
# See CLAUDE.md "Email (ProtonMail)" runbook for the sequence.
# protonmail_verification_token = ""
# protonmail_dkim_selectors     = {}

# Google Workspace site-verification CNAME salvaged from the old DNS
# provider (Squarespace-managed zone) on the 2026-05 cutover (step 8).
# Google reads this at `<label>.millsymills.com` to prove control of
# the domain for Workspace services (Drive/Calendar/etc.). Other
# Squarespace-managed records (mailgun MX, Squarespace A/CNAME, Google
# Search Console TXT, `krs._domainkey` DKIM for an unused outbound
# sender) are intentionally dropped.
google_workspace_verifications = {
  uc5aa7cfxzqa = "gv-b5afe5qh2bo46y.dv.googlehosted.com."
}
