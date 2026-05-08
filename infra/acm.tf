resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"

  # `mta-sts.<domain>` is included unconditionally so the cert covers
  # the subdomain even before MTA-STS is enabled (`var.enable_mta_sts`
  # gates only the Route53 publish; the cert SAN + CloudFront alias
  # are cheap to ship and let the user flip the policy on later
  # without a cert-replacement round-trip). See `infra/mta_sts.tf`.
  subject_alternative_names = [
    "www.${var.domain}",
    "mta-sts.${var.domain}",
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
