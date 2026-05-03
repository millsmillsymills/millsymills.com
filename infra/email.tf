# Email for ${var.domain}: ProtonMail delivery + SPF/DKIM/DMARC.
#
# This file is designed to be safe to deploy BEFORE ProtonMail is set
# up: it falls back to a null MX (RFC 7505), a sender-free SPF, and a
# strict DMARC policy, so the domain can't be spoofed while you're
# still signing up. Once you add `millsymills.com` in Proton's admin:
#
#   1. Copy Proton's verification token into
#      `protonmail_verification_token` and `terraform apply`. This also
#      flips MX + SPF from "no email" to "email via Proton".
#   2. Wait for Proton to verify the domain (DNS propagation).
#   3. Copy the DKIM selectors Proton shows into
#      `protonmail_dkim_selectors` and `terraform apply`.
#   4. Create a `dmarc@${var.domain}` address/alias in Proton so
#      DMARC aggregate reports have somewhere to land.

locals {
  proton_enabled = var.protonmail_verification_token != ""

  spf_record = local.proton_enabled ? "v=spf1 include:_spf.protonmail.ch -all" : "v=spf1 -all"

  mx_records = local.proton_enabled ? [
    "10 mail.protonmail.ch.",
    "20 mailsec.protonmail.ch.",
    ] : [
    # RFC 7505 null MX: domain doesn't accept mail. Hard-bounces any
    # spoofing attempt at the SMTP layer.
    "0 .",
  ]

  # Default to the `dmarc@<domain>` convention when the var is unset,
  # so a fork that changes `var.domain` doesn't accidentally leak
  # DMARC telemetry to the upstream operator's mailbox.
  dmarc_rua  = var.dmarc_report_address != "" ? var.dmarc_report_address : "dmarc@${var.domain}"
  tlsrpt_rua = var.tlsrpt_report_address != "" ? var.tlsrpt_report_address : "tls-rpt@${var.domain}"
}

resource "aws_route53_record" "mx" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 3600
  records = local.mx_records
}

# Apex TXT holds SPF, and (when Proton is active) the Proton domain-
# verification token. DNS allows multiple TXT strings on one name, so
# these coexist fine.
resource "aws_route53_record" "apex_txt" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 3600
  records = compact([
    local.spf_record,
    local.proton_enabled ? "protonmail-verification=${var.protonmail_verification_token}" : "",
  ])
}

# DKIM: three CNAMEs for key rotation. Proton hands you the specific
# targets (e.g. protonmail.domainkey.XYZ.domains.proton.ch.) after
# domain verification succeeds. Leave the map empty to skip.
#
# Gated on proton_enabled so an apply without the verification token
# (e.g., env var missing in a fresh shell) tears DKIM down alongside
# the MX/SPF flip instead of leaving orphaned DKIM CNAMEs while MX
# falls back to null — split-state would misrepresent the domain's
# mail posture.
#
# `nonsensitive()` because for_each forbids sensitive values, and
# whether the token is empty (the boolean derived from it) is already
# observable in the public DNS surface — MX, SPF, DKIM records all
# flip with it. The token's *value* is what's sensitive, not the
# fact that one exists.
resource "aws_route53_record" "dkim" {
  for_each = nonsensitive(local.proton_enabled) ? var.protonmail_dkim_selectors : {}

  zone_id = data.aws_route53_zone.site.zone_id
  name    = "${each.key}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 3600
  records = [each.value]
}

# DMARC: strict reject, strict alignment, aggregate reports to
# dmarc@${var.domain}. Safe to deploy before Proton exists — the
# report address just has nowhere to land yet, which is fine.
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=DMARC1; p=reject; sp=reject; rua=mailto:${local.dmarc_rua}; fo=1; adkim=s; aspf=s",
  ]
}

# SMTP TLS Reporting (RFC 8460): sending MTAs publish daily aggregate
# reports about TLS failures negotiating with our inbound mail. Safe to
# publish before Proton exists — null MX means no remote MTA will try
# delivery anyway, so no reports are generated. Once Proton is live,
# this becomes the telemetry layer for any future MTA-STS rollout.
resource "aws_route53_record" "tlsrpt" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "_smtp._tls.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=TLSRPTv1; rua=mailto:${local.tlsrpt_rua}",
  ]
}

# BIMI: Brand Indicators for Message Identification (RFC 9676 + AuthIndicators
# WG draft). Surfaces the brand logo next to mail that already passed
# DMARC alignment in supporting clients (Fastmail, Proton, some Apple Mail).
# DMARC is at p=reject above, which clears the strong-policy precondition.
#
# Safe to publish before Proton exists: with the null MX, no mail flows,
# so the record is a no-op until activation. Once Proton is live, BIMI
# takes effect on the first DMARC-pass message.
#
# Tradeoff: no Verified Mark Certificate (VMC) — Gmail/Yahoo will not render
# the logo without one (~$1.5K/yr issuance cost). Proton/Fastmail render
# without a VMC, so the record still earns its keep on supporting clients.
# Documented on /security via securityControls.bimi.tradeoffs.
resource "aws_route53_record" "bimi" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "default._bimi.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=BIMI1; l=https://${var.domain}/bimi/logo.svg",
  ]
}
