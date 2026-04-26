# DNSSEC for ${var.domain}: KMS-backed key-signing key (KSK) +
# Route53 zone signing. After `terraform apply`, paste
# `terraform output -raw dnssec_ds_record` into the registrar's DS
# field to chain the parent-zone trust. Required by DANE TLSA (#136).
#
# ORDER OF OPERATIONS on first deploy — getting this wrong takes
# ~50% of the world's resolvers offline for the duration of the
# parent-TTL window:
#
#   1. terraform apply        creates KSK + enables Route53 signing
#   2. dig +dnssec @ns-XXX.awsdns-XX.com ${var.domain}
#                             confirm RRSIGs present at the AWS side
#   3. Paste `terraform output -raw dnssec_ds_record` into registrar
#                             (Squarespace for millsymills, Gandi for p41m0n)
#   4. Wait for parent-zone TTL (.com is ~24-48h)
#   5. https://dnsviz.net/d/${var.domain}/dnssec/
#                             confirm green (no warnings)
#   6. dig +dnssec ${var.domain} | grep ' ad'
#                             AD flag should be set
#
# Reversibility: REMOVE THE DS RECORD AT THE REGISTRAR FIRST and wait
# for parent-TTL to expire BEFORE disabling Route53 signing. Doing it
# in the wrong order makes the zone go BOGUS for validating resolvers
# until the cached DS expires from .com — anywhere from minutes to
# 48 hours of partial outage.
#
# Cost: ~$1/month for the asymmetric KMS key, near-zero for signing
# requests at our query volume.

resource "aws_kms_key" "dnssec" {
  provider = aws.us_east_1

  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 7
  description              = "DNSSEC key-signing key for ${var.domain}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableIAMUserPermissions"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowRoute53DNSSECService"
        Effect    = "Allow"
        Principal = { Service = "dnssec-route53.amazonaws.com" }
        Action    = ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign", "kms:Verify"]
        Resource  = "*"
      },
      {
        Sid       = "AllowRoute53DNSSECCreateGrant"
        Effect    = "Allow"
        Principal = { Service = "dnssec-route53.amazonaws.com" }
        Action    = "kms:CreateGrant"
        Resource  = "*"
        Condition = { Bool = { "kms:GrantIsForAWSResource" = "true" } }
      },
    ]
  })
}

resource "aws_kms_alias" "dnssec" {
  provider      = aws.us_east_1
  name          = "alias/${replace(var.domain, ".", "-")}-dnssec"
  target_key_id = aws_kms_key.dnssec.key_id
}

resource "aws_route53_key_signing_key" "ksk" {
  hosted_zone_id             = data.aws_route53_zone.site.zone_id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                       = "${replace(var.domain, ".", "-")}-ksk"
}

resource "aws_route53_hosted_zone_dnssec" "site" {
  hosted_zone_id = aws_route53_key_signing_key.ksk.hosted_zone_id

  depends_on = [aws_route53_key_signing_key.ksk]
}
