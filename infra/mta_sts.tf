# MTA-STS (RFC 8461) for inbound SMTP.
#
# Two pieces of DNS ship the policy:
#
#   * `mta-sts.<domain>` A + AAAA -- alias to the existing CloudFront
#     distribution, which serves `https://mta-sts.<domain>/.well-known/
#     mta-sts.txt`. The Astro page that produces that file lives at
#     `src/pages/.well-known/mta-sts.txt.ts`.
#   * `_mta-sts.<domain>` TXT -- the discovery record. Sender MTAs
#     query this first; the `id` field changes whenever the policy
#     contents change so caches refresh.
#
# Two-gate provisioning model:
#
#   * `var.enable_mta_sts_alias` gates the cert SAN (`infra/acm.tf`),
#     the CloudFront alias (`infra/cloudfront.tf`), and the A + AAAA
#     records below as one unit. Default true so the host is always
#     reachable on stacks that intend to serve mail; flip to false on
#     stacks that don't (e.g. static-image rehearsal targets) to shrink
#     the cert and free the alias slot.
#   * `var.enable_mta_sts` gates ONLY the `_mta-sts.<domain>` TXT
#     discovery record. Default false because MTA-STS only makes sense
#     once the policy file has been observed in production. The TXT
#     toggle requires the alias toggle (enforced via variable
#     validation) so the discovery record can't advertise a hostname
#     that doesn't resolve. Without TXT, senders fall back to
#     opportunistic STARTTLS -- equivalent to MTA-STS being off.
#
# Pairs with the SMTP TLS Reporting (`_smtp._tls`) record already
# shipped via `infra/email.tf` -- TLS-RPT is the telemetry that
# verifies senders actually picked up the policy. Watch the next
# 24-48h cycle of TLS-RPT reports for `policy-type: sts` (vs
# `no-policy-found`) to confirm the rollout took.
#
# Closes Phase 1 of #134 for any stack with `enable_mta_sts = true`.

resource "aws_route53_record" "mta_sts_a" {
  count = var.enable_mta_sts_alias ? 1 : 0

  zone_id = data.aws_route53_zone.site.zone_id
  name    = "mta-sts.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "mta_sts_aaaa" {
  count = var.enable_mta_sts_alias ? 1 : 0

  zone_id = data.aws_route53_zone.site.zone_id
  name    = "mta-sts.${var.domain}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "mta_sts_txt" {
  count = var.enable_mta_sts ? 1 : 0

  zone_id = data.aws_route53_zone.site.zone_id
  name    = "_mta-sts.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=STSv1; id=${var.mta_sts_id}"]
}

# moved blocks: preserve state addresses across the count = ... gating above.

moved {
  from = aws_route53_record.mta_sts_a
  to   = aws_route53_record.mta_sts_a[0]
}

moved {
  from = aws_route53_record.mta_sts_aaaa
  to   = aws_route53_record.mta_sts_aaaa[0]
}
