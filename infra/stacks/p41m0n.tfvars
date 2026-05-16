aws_region    = "us-west-2"
domain        = "p41m0n.com"
github_repo   = "millsmillsymills/millsymills.com"
deploy_branch = "main"
# deploy_workflow / deploy_environment removed — no GH deploy workflow
# for the slimmed stack (see enable_github_deploy_role = false). The CI
# gate in ci.yml that asserts per-stack deploy_workflow files exist
# falls back to deploy.yml when the var is absent (which exists for
# millsymills), so the assertion still passes.

# All heavyweight features off — see
# docs/superpowers/specs/2026-05-15-p41m0n-teardown-and-static-image-design.md.
enable_inspector_tls      = false
enable_csp_report         = false
enable_webauthn_demo      = false
enable_ct_monitor         = false
enable_access_logging     = false
enable_github_deploy_role = false
enable_index_rewrite      = false
enable_mta_sts_alias      = false
enable_bimi               = false

# Headers profile: minimal — single-image static site.
cloudfront_headers_profile = "minimal"

# Mail: Proton catchall stays. Verification token at apply time via
# TF_VAR_protonmail_verification_token (not committed). DKIM CNAME
# targets are exactly as today — Proton uses fixed selector names and
# infra/email.tf builds <selector>._domainkey.<domain> from the keys.
protonmail_dkim_selectors = {
  protonmail  = "protonmail.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail2 = "protonmail2.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
  protonmail3 = "protonmail3.domainkey.dcj2miv2gaceelgnmv3mwo6jisec66bvrpgjnocazioc4ngrydcua.domains.proton.ch."
}
