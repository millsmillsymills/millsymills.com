aws_region    = "us-west-2"
domain        = "millsymills.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# Set explicitly even though it matches the default — keeps the trust
# policy's expected value visible in the stack file rather than
# relying on a default that could shift.
deploy_environment = "production"

# ProtonMail activated 2026-05-14 per
# docs/superpowers/specs/2026-05-14-millsymills-mail-activation-design.md.
# Verification token is supplied at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets come from Proton's domain page after verification.
# Selectors must be exactly `protonmail`, `protonmail2`, `protonmail3`
# — Proton uses fixed selector names, and infra/email.tf builds
# <selector>._domainkey.<domain> from the map keys.
protonmail_dkim_selectors = {
  protonmail  = "protonmail.domainkey.dhh3t4m67q73jisy4m2k6bsy3jdpjx3se76rhatc5245appg2ip3q.domains.proton.ch."
  protonmail2 = "protonmail2.domainkey.dhh3t4m67q73jisy4m2k6bsy3jdpjx3se76rhatc5245appg2ip3q.domains.proton.ch."
  protonmail3 = "protonmail3.domainkey.dhh3t4m67q73jisy4m2k6bsy3jdpjx3se76rhatc5245appg2ip3q.domains.proton.ch."
}

# Phase 2 MTA-STS promotion to production stack per #134. p41m0n is
# Phase 1 (rehearsal); millsymills picks up the same policy file
# (src/pages/.well-known/mta-sts.txt.ts, mode: testing) by flipping
# the per-stack discovery-TXT switch.
enable_mta_sts = true
mta_sts_id     = "20260514000000"

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
