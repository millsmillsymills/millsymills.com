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
# Pre-stage (today, NOT mid-rotation): the resources below are
# hardcoded singletons. A real rotation needs a second resource
# block (new aws_kms_key, new aws_kms_alias, new aws_route53_key_
# signing_key with a non-colliding `name`, plus an outputs.tf
# entry to expose the second DS digest). Tracked as follow-up:
# refactor to `for_each` on a key-id map, or stage a commented-out
# rotation block. AN ON-CALL SHOULD NOT BE WRITING NEW TERRAFORM
# DURING A ROTATION.
#
# AWS hard limit: Route53 caps KSKs at 2 per hosted zone. Step 6
# must complete before any subsequent rotation can begin.
#
#   1. Uncomment / `for_each`-flip in the pre-staged second KSK
#      resource set. The new KSK gets `prevent_destroy = false`
#      until promotion (step 5) so step 4 has a rollback path.
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
#      remove the new DS at the registrar, wait DS-RRset TTL,
#      `terraform destroy -target=<new KSK>` then
#      `-target=<new KMS key>` (since prevent_destroy is still
#      false from step 1).
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
  name          = "alias/${replace(var.domain, ".", "-")}-dnssec"
  target_key_id = aws_kms_key.dnssec.key_id
}

resource "aws_route53_key_signing_key" "ksk" {
  hosted_zone_id             = data.aws_route53_zone.site.zone_id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                       = "${replace(var.domain, ".", "-")}-ksk"

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
