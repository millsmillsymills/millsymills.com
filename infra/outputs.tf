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
  description = "The four nameservers assigned to the Route53 hosted zone. Paste these into the registrar (Squarespace for millsymills) to flip delegation."
  value       = data.aws_route53_zone.site.name_servers
}

output "dnssec_ds_record" {
  description = "DS record to paste into the registrar's DNSSEC field to chain the parent-zone trust. Paste this LAST, after Route53 is signing the zone — see infra/dnssec.tf for the safe ordering. Format: `<key-tag> <algorithm> <digest-type> <digest-hex>`."
  value       = aws_route53_key_signing_key.ksk.ds_record
}

# Uncomment alongside the ROTATION KSK PRE-STAGE block in dnssec.tf
# to surface the second DS digest during a planned rotation. See
# the planned-rotation procedure in dnssec.tf for the order in which
# this DS gets ADDED at the registrar (step 3) and the old one gets
# REMOVED (step 5).
#
# output "dnssec_ds_record_rotation" {
#   description = "DS record for the rotation KSK. Paste this at the registrar ALONGSIDE dnssec_ds_record during the dual-publish window (procedure step 3 in infra/dnssec.tf)."
#   value       = aws_route53_key_signing_key.ksk_rotation.ds_record
# }
