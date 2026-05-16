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
# Provisioning split between always-on and gated:
#
#   * The ACM SAN, the CloudFront alias, and the A/AAAA records
#     are unconditional (cheap, harmless, lets you flip the policy
#     on later without a cert-replacement round-trip). See
#     `infra/acm.tf` + `infra/cloudfront.tf` + the records below.
#   * The `_mta-sts.<domain>` TXT record is gated on
#     `var.enable_mta_sts`. Without it senders fall back to
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

# moved blocks for the count-gating refactor (2026-05-15).
# aws_route53_record.mta_sts_txt was already count-gated via enable_mta_sts; no move needed.

moved {
  from = aws_route53_record.mta_sts_a
  to   = aws_route53_record.mta_sts_a[0]
}

moved {
  from = aws_route53_record.mta_sts_aaaa
  to   = aws_route53_record.mta_sts_aaaa[0]
}
