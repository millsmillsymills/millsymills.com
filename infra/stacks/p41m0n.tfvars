aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# Rehearsal stack uses its own workflow; override the default (deploy.yml)
# so the OIDC trust policy pins the right job_workflow_ref.
deploy_workflow = "deploy-rehearsal.yml"

# p41m0n rehearsal does not activate ProtonMail; email.tf publishes
# null-MX + strict DMARC in this state. User does not use p41m0n mail.
