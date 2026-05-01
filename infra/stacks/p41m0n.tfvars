aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# Rehearsal stack uses its own workflow; override the default (deploy.yml)
# so the OIDC trust policy pins the right job_workflow_ref.
deploy_workflow    = "deploy-rehearsal.yml"
deploy_environment = "rehearsal" # matches `environment: name:` in deploy-rehearsal.yml

# 2026-05-01 pre-flight unblock: CT-monitor SNS subscription was stuck
# PendingConfirmation because security@p41m0n.com is undeliverable
# (null MX). Routing to a confirmable mailbox so the subscription can
# confirm and the TF baseline clears. Will be reconsidered once Proton
# is fully active — see
# docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md.
ct_monitor_alert_address = "andyandymillsmills@gmail.com"

# ProtonMail activated 2026-05-01 per
# docs/superpowers/specs/2026-05-01-p41m0n-proton-mail-migration-design.md.
# Verification token is supplied at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets come from Proton's domain page after verification.
# Selectors must be exactly `protonmail`, `protonmail2`, `protonmail3`
# — Proton uses fixed selector names, and infra/email.tf builds
# <selector>._domainkey.<domain> from the map keys.
protonmail_dkim_selectors = {
  protonmail  = "protonmail.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail2 = "protonmail2.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail3 = "protonmail3.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
}
