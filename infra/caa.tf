# CAA records for ${var.domain}: tell every public CA which issuers
# are authorized so a mis-issuance request gets rejected at the CA
# (and logged in CT) instead of producing a working rogue cert.
#
# Policy:
#   - `issue "amazon.com"` — only Amazon (ACM) may issue certs for
#     this name. ACM is our only cert source today.
#   - `issuewild ";"` — disallow wildcard issuance entirely. We don't
#     use wildcard certs (ACM cert is for apex + www only), so this
#     closes the wildcard attack surface.
#   - `iodef "mailto:..."` — best-effort: CAs that honor iodef will
#     mail violation reports to this address.
#
# Reference: AWS ACM CAA domains
# https://docs.aws.amazon.com/acm/latest/userguide/setup-caa.html

locals {
  # Default to `security@<domain>` so a fork that changes var.domain
  # doesn't accidentally route iodef reports to the upstream operator.
  caa_iodef = var.caa_iodef_address != "" ? var.caa_iodef_address : "security@${var.domain}"
}

resource "aws_route53_record" "caa" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = var.domain
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"amazon.com\"",
    "0 issuewild \";\"",
    "0 iodef \"mailto:${local.caa_iodef}\"",
  ]
}
