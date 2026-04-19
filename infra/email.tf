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
resource "aws_route53_record" "dkim" {
  for_each = var.protonmail_dkim_selectors

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
    "v=DMARC1; p=reject; sp=reject; rua=mailto:${var.dmarc_report_address}; fo=1; adkim=s; aspf=s",
  ]
}
