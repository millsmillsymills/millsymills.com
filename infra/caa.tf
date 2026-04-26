# CAA records for ${var.domain}: tell every public CA which issuers
# are authorized so a mis-issuance request gets rejected at the CA
# (and logged in CT) instead of producing a working rogue cert.
#
# Policy:
#   - Four `issue` records covering every domain AWS uses to identify
#     ACM-issued certs. ACM has rotated which domain its CT submissions
#     cite over time (amazon.com, amazontrust.com, awstrust.com,
#     amazonaws.com); covering all four future-proofs against an
#     issuance-infrastructure rotation that would otherwise silently
#     break renewals. AWS's published guidance is to allow all four.
#   - `issuewild ";"` — disallow wildcard issuance entirely. We don't
#     use wildcard certs (ACM cert is for apex + www only), so this
#     closes the wildcard attack surface.
#   - `iodef "mailto:..."` — best-effort: CAs that honor iodef will
#     mail violation reports to this address.
#
# TTL is 300 (5 min). Rationale: CAA is consulted only at cert
# issuance, so the TTL has no steady-state cost. A short TTL turns a
# misconfig (e.g., accidentally narrowing the allow-list before a
# scheduled ACM renewal) into a 5-minute fix instead of an hour-long
# wait. Renewals already retry on CAA failure, so the operational
# floor is fast.
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
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"amazontrust.com\"",
    "0 issue \"awstrust.com\"",
    "0 issue \"amazonaws.com\"",
    "0 issuewild \";\"",
    "0 iodef \"mailto:${local.caa_iodef}\"",
  ]
}
