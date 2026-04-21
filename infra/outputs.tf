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
