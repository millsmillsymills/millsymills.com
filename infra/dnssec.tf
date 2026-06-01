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
# Reversibility (planned shutdown): REMOVE THE DS RECORD AT THE
# REGISTRAR FIRST and wait for parent-TTL to expire BEFORE disabling
# Route53 signing. Doing it in the wrong order makes the zone go
# BOGUS for validating resolvers until the cached DS expires from
# .com (the relevant TTL is the DS-RRset TTL, ~86400s = 24h on
# typical .com glue, not the 172800s NS TTL).
#
# ─── Suspected key compromise (do this FIRST, do not dual-publish) ───
#
# Threat model: kms:Sign abuse via stolen IAM credential, an
# attacker-minted KMS grant, or hypothetical KMS service incident.
# (NOT scoped: full AWS account takeover — see step 0.)
#
# The dual-publish ceremony in the planned-rotation section below is
# the wrong shape under active threat. It preserves the chain of
# trust during a controlled rollover, which during compromise means
# giving the attacker forged-but-validated answers for the entire
# parent-TTL window (potentially days). Compromise response prefers
# the inverse tradeoff: brief BOGUS state for validating resolvers
# (~50% of the internet, falling back to the unsigned answer; the
# other ~50% see the answer normally) over forge-capable signing.
#
#   0. If account takeover is suspected, regain account control
#      FIRST: rotate root credentials, audit IAM and SCP, revoke
#      STS sessions. Otherwise every step below runs against
#      attacker-controlled state.
#
#   1. STOP THE BLEEDING. Disable the suspected key via the AWS CLI:
#
#         aws kms disable-key --key-id <kms-key-id>
#
#      Effect: kms:Sign returns DisabledException; Route53 zone
#      signing fails; validating resolvers see BOGUS for ~the cached
#      DNSKEY/RRSIG TTL (minutes-to-hours, configurable on the
#      hosted_zone_dnssec resource — much shorter than parent-TTL).
#      This is fast, recoverable (`enable-key`), and stops attacker
#      kms:Sign immediately. Do not `terraform destroy` here — the
#      prevent_destroy guards refuse, and resource removal isn't
#      what stops signing anyway (disabled-but-present is what does).
#
#   2. Audit and revoke non-Route53 grants on the disabled key:
#
#         aws kms list-grants --key-id <kms-key-id>
#         aws kms revoke-grant --key-id <kms-key-id> --grant-id <id>
#
#      Reason: the key policy explicitly allows `dnssec-route53` to
#      mint persistent grants. An attacker with prior IAM access
#      could have minted additional grants that survive policy
#      edits and key disable; explicit `revoke-grant` is the only
#      cleanup. Leave the legitimate Route53 service grant alone.
#
#   3. Plan the rotation calmly (post-containment). With kms:Sign
#      blocked, there is no time pressure. Either follow the
#      planned-rotation procedure below, or — if the registrar
#      side is the bottleneck (see Squarespace caveat) — accept
#      a brief BOGUS window: remove the old DS at the registrar
#      first, wait DS-RRset TTL, then provision a fresh KSK and
#      publish its DS. The disabled key stays disabled forever or
#      gets terraform-destroyed via the planned-rotation step 6.
#
# ─── Planned rotation (annual / post-personnel-change, no adversary) ───
#
# Use this only when no compromise is suspected. Goal is to swap
# keys without breaking the chain of trust at any point.
#
# Pre-stage: the rotation KSK + KMS key + alias + outputs are
# committed to this file as a commented-out block at the bottom
# (search for "ROTATION KSK PRE-STAGE"). A real rotation is the
# uncomment + apply path; an on-call should NOT be writing new
# Terraform under pressure.
#
# AWS hard limit: Route53 caps KSKs at 2 per hosted zone. Step 6
# must complete before any subsequent rotation can begin.
#
#   1. UNCOMMENT TWO PLACES: the ROTATION KSK PRE-STAGE block at
#      the bottom of this file AND the `dnssec_ds_record_rotation`
#      output in outputs.tf. They are paired — uncommenting only
#      the first leaves the registrar-paste step (step 3) without
#      a DS digest to fetch. The block is shaped intentionally —
#      `prevent_destroy = false` on creation so step 4 has a
#      rollback path; flip to `true` at promotion (step 5).
#   2. `terraform apply` — both KSKs ACTIVE; aws_route53_hosted_
#      zone_dnssec needs no change, it auto-covers both keys.
#   2a. `dig +dnssec @ns-XXX.awsdns-XX.com ${var.domain} DNSKEY` —
#       confirm BOTH DNSKEY RRs (old + new) return before touching
#       the registrar. (If the new DNSKEY is missing, fix here, do
#       not proceed.)
#   3. ADD the new DS record at the registrar alongside the old
#      one. Verify in advance that the active registrar supports
#      multiple simultaneous DS records — Gandi confirmed (up to 4
#      via interface); Squarespace's UI is uncertain and worth
#      pre-confirming. If the registrar is single-DS-only, fall
#      back to the brief-BOGUS-window variant from compromise
#      step 3.
#   4. Wait for the parent-zone DS-RRset TTL (.com publishes
#      `DS 86400` ≈ 24h; verify with
#      `dig DS ${var.domain} @a.gtld-servers.net +noall +answer`).
#      During this wait, https://dnsviz.net/d/${var.domain}/dnssec/
#      should show the new DS validating cleanly. Rollback if not:
#      remove the new DS at the registrar, wait DS-RRset TTL, then
#      `terraform destroy -target=aws_route53_key_signing_key.ksk_rotation`
#      followed by `-target=aws_kms_alias.dnssec_rotation` and
#      `-target=aws_kms_key.dnssec_rotation` (in that order — the
#      alias depends on the KMS key, so destroying the key first
#      orphans the alias and forces a re-apply to clean up). The
#      `prevent_destroy = false` on creation is what lets these
#      destroys plan; the primary's prevent_destroy = true is
#      untouched throughout, so the existing chain of trust is
#      never at risk during rollback.
#   5. REMOVE the old DS at the registrar; wait DS-RRset TTL again.
#      Flip prevent_destroy = true on the new KSK + KMS key in
#      Terraform; this is the "promotion" step. Apply.
#   6. Retire the OLD KSK + KMS key. To actually destroy (not just
#      flip lifecycle metadata): set `prevent_destroy = false` on
#      the old resources, REMOVE their resource blocks, then
#      `terraform apply` (or `terraform destroy -target=<old KSK>`
#      then `-target=<old KMS key>`). Flipping the lifecycle alone
#      is a no-op for retirement.
#
# Recovery within the 7-day KMS deletion window: if step 6 was
# rushed and the old key turns out to still be needed,
# `aws kms cancel-key-deletion --key-id <id>` restores the KMS
# material. The KSK metadata (the `aws_route53_key_signing_key`
# resource) is gone but recreatable — point a fresh KSK at the
# rescued KMS key and the resulting DS digest is computed over
# owner+algo+pubkey, so it matches the original DS. Restore the
# old DS at the registrar and the chain of trust resumes.
#
# Cost: ~$1/month per asymmetric KMS key, near-zero for signing
# requests at our query volume.

resource "aws_kms_key" "dnssec" {
  provider = aws.us_east_1

  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 7
  description              = "DNSSEC key-signing key for ${var.domain}"

  # Belt-and-suspenders against the BOGUS-zone footgun: a stray
  # `terraform destroy` while the DS record is still at the registrar
  # would schedule this key for deletion and break signing for ~50% of
  # resolvers until parent-TTL expires. The Reversibility note above is
  # the human protocol; this is the machine guard. Set to false +
  # `terraform apply` only after the registrar-side DS record is gone
  # and parent-TTL has expired.
  lifecycle {
    prevent_destroy = true
  }

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
  name          = "alias/${local.domain_slug}-dnssec"
  target_key_id = aws_kms_key.dnssec.key_id
}

resource "aws_route53_key_signing_key" "ksk" {
  hosted_zone_id             = data.aws_route53_zone.site.zone_id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                       = "${local.domain_slug}-ksk"

  # Same rationale as the KMS key: destroying the KSK while the DS
  # record is still published at the registrar breaks the chain of
  # trust until parent-TTL flushes. Removal procedure is in the file
  # header — flip this to false only after the registrar-side DS is
  # gone and the cache window has cleared.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_hosted_zone_dnssec" "site" {
  hosted_zone_id = aws_route53_key_signing_key.ksk.hosted_zone_id

  depends_on = [aws_route53_key_signing_key.ksk]
}

# ─── ROTATION KSK PRE-STAGE ─────────────────────────────────────────
#
# Uncomment this block + the `dnssec_ds_record_rotation` output in
# outputs.tf to provision a second KSK alongside the primary one,
# per the planned-rotation procedure documented at the top of this
# file. The shape mirrors the primary resources (same KMS spec, same
# policy, same Route53 wiring) so a fresh `terraform apply` brings
# the second key online without inventing anything new.
#
# Two intentional differences from the primary block:
#
#   1. `prevent_destroy = false` on creation. Step 4 of the rotation
#      procedure waits for parent-TTL with the new DS published at
#      the registrar; if dnsviz shows the new chain is broken during
#      that window, the rollback is `terraform destroy -target=<new
#      KSK>` then `-target=<new KMS key>`, which only works while
#      the lifecycle guard is off. Flip to `true` at promotion
#      (procedure step 5) once the new DS is verified-good and the
#      old DS has been removed at the registrar.
#
#   2. Resource names + alias suffix `-rotation` so the two KSKs
#      coexist without colliding on `aws_kms_alias.name` (must be
#      unique per region) or `aws_route53_key_signing_key.name`
#      (must be unique per zone).
#
# Once retired (procedure step 6: old KSK + KMS key removed), the
# leave-as-is form is the recommended path: the rotation resources
# stay named `dnssec_rotation` / `ksk_rotation`, and the next
# rotation will hand-author its own pre-stage block above (or
# revisit this comment to re-introduce a `_rotation2`-style staged
# block). State-mv-back-to-primary is possible but not the default —
# at 3am-of-cleanup the leave-as-is form has fewer moving parts.
#
# If you DO want the state-mv path (post-incident, calmly): rename
# the rotation resources to the original `dnssec` / `ksk` names in
# this file FIRST (after the old blocks are removed), then run:
#
#   terraform state mv aws_kms_key.dnssec_rotation aws_kms_key.dnssec
#   terraform state mv aws_kms_alias.dnssec_rotation aws_kms_alias.dnssec
#   terraform state mv aws_route53_key_signing_key.ksk_rotation \\
#     aws_route53_key_signing_key.ksk
#
# Then `terraform apply` — should be a no-op diff since the
# resource state matches the file. Repeat per stack (millsymills,
# p41m0n).
#
# Apply cost: ~$1/month while the second KMS key is active. Free
# while commented out.
#
# resource "aws_kms_key" "dnssec_rotation" {
#   provider = aws.us_east_1
#
#   customer_master_key_spec = "ECC_NIST_P256"
#   key_usage                = "SIGN_VERIFY"
#   deletion_window_in_days  = 7
#   description              = "DNSSEC rotation key-signing key for ${var.domain}"
#
#   # Intentionally false until promotion (procedure step 5).
#   # Step 4's rollback path needs `terraform destroy -target` to
#   # work on this key.
#   lifecycle {
#     prevent_destroy = false
#   }
#
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Sid       = "EnableIAMUserPermissions"
#         Effect    = "Allow"
#         Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
#         Action    = "kms:*"
#         Resource  = "*"
#       },
#       {
#         Sid       = "AllowRoute53DNSSECService"
#         Effect    = "Allow"
#         Principal = { Service = "dnssec-route53.amazonaws.com" }
#         Action    = ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign", "kms:Verify"]
#         Resource  = "*"
#       },
#       {
#         Sid       = "AllowRoute53DNSSECCreateGrant"
#         Effect    = "Allow"
#         Principal = { Service = "dnssec-route53.amazonaws.com" }
#         Action    = "kms:CreateGrant"
#         Resource  = "*"
#         Condition = { Bool = { "kms:GrantIsForAWSResource" = "true" } }
#       },
#     ]
#   })
# }
#
# resource "aws_kms_alias" "dnssec_rotation" {
#   provider      = aws.us_east_1
#   name          = "alias/${local.domain_slug}-dnssec-rotation"
#   target_key_id = aws_kms_key.dnssec_rotation.key_id
# }
#
# resource "aws_route53_key_signing_key" "ksk_rotation" {
#   hosted_zone_id             = data.aws_route53_zone.site.zone_id
#   key_management_service_arn = aws_kms_key.dnssec_rotation.arn
#   name                       = "${local.domain_slug}-ksk-rotation"
#
#   # Intentionally false until promotion (procedure step 5).
#   # Step 4's rollback path needs `terraform destroy -target` to work.
#   lifecycle {
#     prevent_destroy = false
#   }
# }
#
# (No second `aws_route53_hosted_zone_dnssec` resource — Route53's
# zone-signing config auto-covers any KSK on the zone, and only one
# such resource is supported per zone.)
