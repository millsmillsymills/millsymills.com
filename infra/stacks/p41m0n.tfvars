aws_region    = "us-east-1"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"

# p41m0n rehearsal does not activate ProtonMail; email.tf publishes
# null-MX + strict DMARC in this state. User does not use p41m0n mail.
