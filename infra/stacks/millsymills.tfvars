aws_region    = "us-west-2"
domain        = "millsymills.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"

# Re-enabled 2026-05-22 after #576 codified both post-October-2025 Lambda
# permissions (`InvokeFunctionUrl` AND `InvokeFunction` via function URL).
# `csp_report` and `inspector_tls` verified live-handling requests in the
# steady state — same dual-permission shape is provisioned for hits via
# `aws_lambda_permission.hits_cloudfront_invoke`. See #551 / #571 / #576.
enable_hitcounter = true
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

# MTA-STS on the production stack per #134. millsymills serves the
# policy file (src/pages/.well-known/mta-sts.txt.ts, mode: testing)
# with the per-stack discovery-TXT switch enabled.
enable_mta_sts = true
# Bumped 2026-05-17 alongside the mta-sts.txt.ts max_age 86400 -> 604800
# change (RFC 8461 §3.2). Senders refresh their cached policy when this
# value changes; the bump is what makes the new max_age propagate.
mta_sts_id = "20260517000000"

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
