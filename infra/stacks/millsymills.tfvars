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
