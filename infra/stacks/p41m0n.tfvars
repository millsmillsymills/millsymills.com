aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# Rehearsal stack uses its own workflow; override the default (deploy.yml)
# so the OIDC trust policy pins the right job_workflow_ref.
deploy_workflow    = "deploy-rehearsal.yml"
deploy_environment = "rehearsal" # matches `environment: name:` in deploy-rehearsal.yml

# Routes CT-monitor SNS alerts off-domain. The endpoint sits outside
# the Proton catchall on purpose — if the mail-flow path is ever the
# subject of the alert (DNS hijack, MX takeover, mis-issued cert
# affecting Proton's MX hosts), an alert routed through that same
# path could be silently swallowed. Originally needed because the
# subscription was stuck PendingConfirmation against a null-MX endpoint
# (2026-05-01 pre-flight); kept off-domain for the redundancy property.
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
