# Canarytokens runbook (#141)

Two tripwires ship from this repo. Both are inert by design — anything that
trips them is, by construction, someone poking where they shouldn't.

| Tripwire | Bait | Detection | Alert |
|---|---|---|---|
| AWS access-key canary | A deny-all IAM user's access key, planted in `/files/account-recovery-keys.pdf` | Dedicated multi-region CloudTrail → CloudWatch metric filter on the key id | SNS email (primary region) |
| Robots decoy | `/admin/backup/`, Disallowed in `robots.txt` | CloudFront Function `console.log` → us-east-1 metric filter on the `CANARY_TRIPWIRE` sentinel | SNS email (us-east-1) |

All resources are gated on `enable_canary` and `canary_alert_address` in
`infra/stacks/<stack>.tfvars`. Code lives in `infra/canary.tf` and
`infra/cloudfront_function_index.js`.

## Why the secret never lands in git

GitHub secret scanning reports any AWS secret access key it sees to AWS, which
auto-applies the `AWSCompromisedKeyQuarantine` policy — which would defeat the
canary (the key gets disabled and any attacker probe returns a different error).
So the key's secret is a **sensitive Terraform output only**; it is planted
out-of-band into the live site and never committed. The decoy PDF tracked in the
repo is a placeholder — the real, key-bearing PDF is uploaded straight to S3.

## Activation (one-time, per stack)

Prereq: `enable_canary = true`, `enable_index_rewrite = true` (the robots
tripwire alarms on logs from the index-rewrite CloudFront Function — the plan
fails loudly if the canary is enabled without it), and
`canary_alert_address = "<inbox you check>"` are set in the stack's tfvars
(already committed for millsymills.com).

Before the first apply, confirm AWS hasn't already auto-created the function log
group (Terraform owns it; a pre-existing group fails the apply with "already
exists"). Expect empty output:

```bash
aws logs describe-log-groups --region us-east-1 \
  --log-group-name-prefix "/aws/cloudfront/function/<slug>-index-rewrite" \
  --query 'logGroups[].logGroupName'
```

1. **Apply.** `./scripts/tf.sh <stack> apply`. This creates the IAM bait user +
   access key, the CloudTrail + its bucket + CloudWatch log group, both metric
   filters/alarms, and **two** SNS topics (key-used in the primary region,
   robots-tripwire in us-east-1).

2. **Confirm both SNS email subscriptions.** AWS sends a "Subscription
   Confirmation" email to `canary_alert_address` for *each* topic
   (`<slug>-canary` and `<slug>-canary-robots`). Click both confirmation links —
   an unconfirmed subscription silently drops alarms. Verify:
   ```bash
   aws sns list-subscriptions-by-topic --region us-west-2 \
     --topic-arn "$(terraform -chdir=infra output -raw canary_sns_topic_arn 2>/dev/null)"
   aws sns list-subscriptions-by-topic --region us-east-1 \
     --topic-arn "$(terraform -chdir=infra output -raw canary_robots_sns_topic_arn 2>/dev/null)"
   ```
   Each should show `SubscriptionArn` as an ARN, not `PendingConfirmation`.

3. **Extract the key (out-of-band, never to disk in the repo).**
   ```bash
   terraform -chdir=infra output -raw canary_access_key_id
   terraform -chdir=infra output -raw canary_secret_access_key   # sensitive
   ```

4. **Plant the key in the live PDF and upload straight to S3.** Build the lure
   PDF locally with the real `aws_access_key_id` / `aws_secret_access_key`
   embedded in a credentials block, then upload it to the prod bucket so it
   overwrites the repo placeholder. Do **not** commit the key-bearing PDF.
   ```bash
   aws s3 cp ./account-recovery-keys.pdf \
     s3://<prod-bucket>/files/account-recovery-keys.pdf \
     --content-type application/pdf
   trash ./account-recovery-keys.pdf   # do not leave the keyed PDF on disk
   ```
   > A `deploy.yml` run with `aws s3 sync --delete` will restore the repo
   > placeholder and wipe the keyed copy. Re-upload after any full deploy, or
   > exclude the path from the sync.

## The location → meaning registry (out-of-band, encrypted)

Keep a private registry mapping each planted token to what an alert *means* —
which file, which decoy, expected-vs-suspicious context. It MUST live outside
this repo (a clone defeats an in-repo registry). Store it encrypted (e.g. a
`age`/`gpg`-encrypted note, a password-manager secure note, or a 1Password
item). Minimum fields per token:

- Token id (the access-key id, or `robots:/admin/backup/`)
- Plant location (S3 key, URL path)
- What a hit means + first-response step
- Date planted / rotated

## Testing the tripwires

- **Robots decoy (safe to trip):** `curl -s https://<domain>/admin/backup/` then
  wait up to ~5 min (alarm period) for the us-east-1 email. The path 404s; the
  alert is the only observable effect. CloudFront Function logs take a minute or
  two to surface in `/aws/cloudfront/function/<slug>-index-rewrite` (us-east-1).
- **AWS-key canary:** do **not** test by using the real bait key from a tracked
  machine — that pollutes the signal and ties your own identity to the trail.
  Trust the deny-all + metric-filter wiring; if you must validate end-to-end,
  sign a throwaway `sts get-caller-identity` with the key from an unattributable
  host and expect the `<slug>-canary` email.

## Rotation

Re-mint the access key (`./scripts/tf.sh <stack> apply -replace='aws_iam_access_key.canary[0]'`),
re-plant per step 4, and update the registry. No fixed cadence — rotate if you
suspect the PDF was indexed/cached somewhere it shouldn't be.

## Teardown

Set `enable_canary = false` and apply. Note: once the CloudFront Function has
logged a `CANARY_TRIPWIRE` line, AWS will have created
`/aws/cloudfront/function/<slug>-index-rewrite`; after teardown that log group
is no longer Terraform-managed. Re-enabling later will fail with "log group
already exists" — delete the auto-created group (or `terraform import` it)
before re-applying.
