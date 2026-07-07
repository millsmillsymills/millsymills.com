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
# Deliberate opt-in to the WebAuthn passkey demo (#650). The variable
# defaults to false so merging #631 + the next scheduled deploy don't
# provision the public Function URL + /api/passkey/* behavior on their
# own; flipping this true here is the explicit, flag-gated prod apply
# step. Tear down by setting this false and applying. Requires
# enable_csp_report + enable_inspector_tls (both default true), enforced
# by validations in infra/variables.tf.
enable_webauthn_demo = true
# Set explicitly even though it matches the default — keeps the trust
# policy's expected value visible in the stack file rather than
# relying on a default that could shift.
deploy_environment = "production"

# Canarytoken (#141). Bait key + CloudTrail + email alarm. Confirm the SNS
# subscription email after apply, then plant the key out-of-band per
# docs/runbooks/canarytokens.md. Never commit the key secret.
enable_canary        = true
canary_alert_address = "security@millsymills.com"

# Slack delivery for canary alarms (alongside the email subscriptions). The
# AWS Chatbot Slack config "slack-qdev-chatbot" was created in the console
# (workspace OAuth + #infra-alerts channel) and is adopted into Terraform via
# `terraform import` -- NOT a plain apply, which would fail on the existing
# config. Run the import before the first apply with these set. Terraform's
# only change on apply is adding the us-west-2 key-used topic alongside the
# us-east-1 robots topic the console already wired. See
# docs/runbooks/canarytokens.md.
#
# canary_slack_team_id / canary_slack_channel_id / canary_slack_iam_role_arn
# live in the gitignored infra/stacks/millsymills.secrets.tfvars (auto-loaded
# by scripts/tf.sh for plan/apply/destroy/refresh -- NOT import; pass both
# -var-files explicitly there, see the runbook). Not credentials, but the
# role ARN embeds the AWS account
# id and the Slack ids name the alerting workspace/channel -- infra metadata
# this public repo shouldn't hand out. Without the secrets file, plan fails
# fast on the aws_chatbot_slack_channel_configuration precondition.
enable_canary_slack      = true
canary_slack_config_name = "slack-qdev-chatbot"

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
# policy file (src/pages/.well-known/mta-sts.txt.ts, mode: enforce)
# with the per-stack discovery-TXT switch enabled.
enable_mta_sts = true
# Bumped 2026-06-11 alongside the mta-sts.txt.ts testing -> enforce flip
# (#385). Senders refresh their cached policy when this value changes;
# the bump is what makes the enforce mode propagate.
mta_sts_id = "20260611000000"

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
