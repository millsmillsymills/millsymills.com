resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"

  # The `mta-sts.<domain>` SAN is gated on `var.enable_mta_sts_alias`.
  # When true (millsymills default), the cert covers apex + www + mta-sts
  # so the operator can flip MTA-STS on/off via `enable_mta_sts` without
  # a cert-replacement round-trip. When false (p41m0n teardown), the cert
  # shrinks to apex + www, freeing the SAN slot and avoiding ACM renewals
  # on a subdomain that resolves to nothing.
  subject_alternative_names = compact([
    "www.${var.domain}",
    var.enable_mta_sts_alias ? "mta-sts.${var.domain}" : "",
  ])

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
