# Canarytokens runbook (#141)

A canarytoken is bait: something an intruder is tempted to use, that does
nothing except alert you when it's touched. This stack ships three, strongest
first.

## 1. AWS access-key canary (active alert)

An IAM user (`millsymills-com-canary`) whose inline policy denies every action,
holding an access key. The key can do nothing — but any API call signed with it
is recorded by a dedicated multi-region CloudTrail, and a metric filter on the
key id fires a CloudWatch alarm to an SNS email. A hit is unambiguous: nobody
legitimate ever uses this key.

Implemented in `infra/canary.tf`. Off by default (`enable_canary = false`).

### Activate

1. Set the alert mailbox in `infra/stacks/millsymills.tfvars`:
   `enable_canary = true` and `canary_alert_address = "security@millsymills.com"`
   (or any alias you actually monitor).
2. `./scripts/tf.sh millsymills apply`.
3. Confirm the **AWS Notification — Subscription Confirmation** email, or
   alerts go nowhere.
4. Read the planted credential out of the (sensitive) Terraform outputs:
   ```bash
   terraform -chdir=infra output -raw canary_access_key_id
   terraform -chdir=infra output -raw canary_secret_access_key
   ```

### Plant it — do NOT commit the secret

GitHub secret scanning detects AWS secret access keys in public repos and
reports them to AWS, which auto-applies `AWSCompromisedKeyQuarantine` and
defeats the canary. **Never put the secret in git.** Plant it where an intruder
who has already gained some access would look, out of the repo's tracked tree —
for example a fake credentials file written straight to the live bucket:

```bash
cat > /tmp/credentials <<EOF
[default]
aws_access_key_id = <canary_access_key_id>
aws_secret_access_key = <canary_secret_access_key>
EOF
aws s3 cp /tmp/credentials s3://millsymills.com/.aws/credentials.bak
shred -u /tmp/credentials   # or: trash
```

The object is served by CloudFront but lives only in S3, never in git, so
secret-scanning can't see it. Record where you planted it in the out-of-band
registry below.

### When the alarm fires

The key is bait — a hit means someone found and tried the planted credential.
Treat as an intrusion signal: find how they reached the plant location, rotate
anything real that shared that location, and review CloudTrail for the source IP
and what else that actor touched.

## 2. robots.txt tripwire (forensic)

`Disallow: /admin/backup/` in `public/robots.txt`. No content lives there; a
request for it is curiosity-driven probing. It is **not** actively alerted —
hits surface in the CloudFront access logs (`infra/cloudfront_logging.tf`, 90d).
Upgrade path: a CloudFront Function or a log metric filter to alarm on the path.

## 3. Lure PDF (forensic)

`public/files/account-recovery-keys.pdf` — a decoy with a tempting filename and
no real content. Its download surfaces in the CloudFront access logs. It does
not beacon; the active upgrade is an embedded remote resource that calls a
logging endpoint when the document is opened.

## Out-of-band registry (keep OUT of this repo)

Maintain a private note — encrypted, or in a password manager, anywhere that
isn't a clone of this repo — mapping each token to what its alert means:

| token | location planted | what a hit means |
|---|---|---|
| AWS key | _e.g._ `s3://millsymills.com/.aws/credentials.bak` | someone reached the plant location and tried the key |
| robots tripwire | `/admin/backup/` | path-guessing / scanner |
| lure PDF | `/files/account-recovery-keys.pdf` | someone downloaded the decoy |

If the registry lives in the repo, anyone who clones it learns which paths are
fake and the canaries are defeated.
