# Canarytokens runbook (#141)

Two tripwires ship from this repo. Both are inert by design — anything that
trips them is, by construction, someone poking where they shouldn't.

| Tripwire | Bait | Detection | Alert |
|---|---|---|---|
| AWS access-key canary | A deny-all IAM user's access key, planted in `/files/account-recovery-keys.pdf` | Dedicated multi-region CloudTrail → CloudWatch metric filter on the key id | SNS email (primary region) + Slack (optional) |
| Robots decoy | `/admin/backup/`, Disallowed in `robots.txt` | CloudFront Function `console.log` → us-east-1 metric filter on the `CANARY_TRIPWIRE` sentinel | SNS email (us-east-1) + Slack (optional) |

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
   Or run the assertion (also opt-in in `ci-local.sh` via
   `MMS_VERIFY_CANARY_SUBS=true`), which fails if either is unconfirmed:
   ```bash
   ./scripts/verify-canary-subscriptions.sh
   ```

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

## Slack delivery (optional, second channel)

Both alarms can also post to Slack via AWS Chatbot, alongside the email
subscriptions (which stay — an intrusion alarm shouldn't ride a single delivery
path). One Chatbot channel configuration subscribes to both SNS topics (the
primary-region key-used topic and the us-east-1 robots topic). Code lives in
`infra/canary.tf`, gated on `enable_canary_slack`.

The config is **console-created, then imported** — AWS Chatbot's Slack-workspace
OAuth and channel role are console-only, so Terraform adopts the existing config
rather than minting it. A plain `apply` (without importing first) would fail on
the already-existing config, so the import step is not optional.

1. **Create the config in the console.** AWS console → **Amazon Q Developer in
   chat applications** (formerly AWS Chatbot) → **Configure new client → Slack**
   → approve the OAuth prompt → create a Slack channel configuration. Pick the
   target channel (invite the AWS app first for a private channel: `/invite
   @aws`), an existing or new channel role, and the `ReadOnlyAccess` guardrail.
   Wire at least one of the canary SNS topics so the console lets you save; the
   test-message button confirms delivery.
2. **Read the live values** (none are secrets — workspace identifiers + a role
   ARN, safe in committed tfvars). The config is homed in the primary region:
   ```bash
   aws chatbot describe-slack-channel-configurations --region us-west-2 \
     --query 'SlackChannelConfigurations[].{name:ConfigurationName,arn:ChatConfigurationArn,team:SlackTeamId,channel:SlackChannelId,role:IamRoleArn,topics:SnsTopicArns}'
   ```
3. **Set them in the stack tfvars** (already filled for millsymills.com in
   `infra/stacks/millsymills.tfvars`):
   ```hcl
   enable_canary_slack       = true
   canary_slack_config_name  = "slack-qdev-chatbot"
   canary_slack_team_id      = "T016XEDEFBM"
   canary_slack_channel_id   = "C05LVBZHM17"
   canary_slack_iam_role_arn = "arn:aws:iam::025507317036:role/service-role/Slack-qdev-chatbot-role"
   ```
4. **Import the config, then apply.** Import adopts the live config into state;
   apply then reconciles the one managed difference — adding the key-used topic
   alongside the robots topic:
   ```bash
   # tf.sh does NOT auto-load the stack tfvars for `import` (it does for
   # plan/apply), so pass it explicitly here -- otherwise enable_canary_slack
   # defaults false, the resource counts to zero, and import fails with
   # "resource address does not exist in configuration".
   ./scripts/tf.sh <stack> import -var-file=stacks/<stack>.tfvars \
     'aws_chatbot_slack_channel_configuration.canary[0]' \
     'arn:aws:chatbot::<account-id>:chat-configuration/slack-channel/<config-name>'
   ./scripts/tf.sh <stack> plan    # expect: ~ sns_topic_arns += key-used topic, nothing else
   ./scripts/tf.sh <stack> apply
   ```
   There is no confirmation click as with SNS email — delivery is live once the
   config exists.
5. **Test** with the robots decoy (`curl -s https://<domain>/admin/backup/`);
   the alarm should post to the Slack channel within the ~5-min alarm period.
   For the key-used topic, trust the wiring rather than exercising the real bait
   key (see "Testing the tripwires").

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
