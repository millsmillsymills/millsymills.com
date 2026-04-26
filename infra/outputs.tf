output "cloudfront_domain" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "s3_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "route53_nameservers" {
  description = "The four nameservers assigned to the Route53 hosted zone. Paste these into the registrar (Squarespace for millsymills; Gandi for p41m0n) to flip delegation."
  value       = data.aws_route53_zone.site.name_servers
}

output "dnssec_ds_record" {
  description = "DS record to paste into the registrar's DNSSEC field to chain the parent-zone trust. Paste this LAST, after Route53 is signing the zone — see infra/dnssec.tf for the safe ordering. Format: `<key-tag> <algorithm> <digest-type> <digest-hex>`."
  value       = aws_route53_key_signing_key.ksk.ds_record
}
