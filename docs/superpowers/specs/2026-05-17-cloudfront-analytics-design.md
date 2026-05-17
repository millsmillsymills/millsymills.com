# CloudFront-logs analytics for millsymills.com

Status: design
Date: 2026-05-17

## Goal

Give the operator a way to answer ordinary "who's hitting what" questions
about millsymills.com (and the p41m0n rehearsal stack while it still exists)
without breaking the published privacy claim that the site ships no
analytics beacon, no third-party scripts, and no cookies.

Concrete questions the tool should answer cheaply:

- Top URLs and 4xx/5xx URLs over the last N days.
- HTTP status distribution.
- Referrer breakdown.
- User-agent breakdown (informs compat decisions, surfaces bot traffic).
- Requests-over-time trend.
- Hit counts on specific paths (e.g. `/demo/passkey/*`, `/security/`).

## Non-goals

- No client-side analytics beacon of any kind — including
  privacy-friendly cookieless ones like Cloudflare Web Analytics or
  Plausible. The privacy page's load-bearing claim
  ("zero third-party fetches", `script-src 'self'`) and the `no-tracking`
  security control in [`src/data/security-controls.ts`](../../../src/data/security-controls.ts)
  are higher-value than richer analytics data.
- No real-time / live-tailing dashboard. On-demand reporting only.
- No geo enrichment in v1. (Skipped per maintainer call: low signal on a
  personal site, adds a MaxMind dependency.)
- No Cloudflare involvement. The original framing of this work assumed
  using Cloudflare Web Analytics + opening a follow-up issue for
  cost-effective Cloudflare protections on the account. Both were dropped
  during brainstorming: WA conflicts with the privacy claim, and every
  Cloudflare protection that fits an AWS-only architecture (Turnstile,
  Email Routing, DNS hosting) either duplicates an existing control or
  re-introduces the third-party-script tension. The deliberate output of
  that decision is "no Cloudflare-protections follow-up issue."

## Architecture

CloudFront access logs already exist and are configured exactly the way
modern columnar analytics wants them:

- Delivered via the CloudWatch Logs v2 delivery framework
  (`aws_cloudwatch_log_delivery_*` in [`infra/cloudfront_logging.tf`](../../../infra/cloudfront_logging.tf)).
- Output format: **Parquet** (columnar, compressed).
- Path layout: **Hive-compatible** (`enable_hive_compatible_path = true`),
  yielding partitions like
  `s3://<domain>-logs/.../cloudfront-access/AwsAccountId=<acct>/AwsRegion=Global/year=2026/month=05/day=17/hour=18/`.
- Retention: 90 days current + up to 90 days noncurrent
  (per [`infra/s3.tf`](../../../infra/s3.tf)).

The work in this spec adds a thin, local-only query layer on top.

```
S3 (Parquet, Hive-partitioned)  →  DuckDB (local, via httpfs)  →  results to stdout / .cache
```

Everything runs on the operator's workstation, using their existing AWS
credentials. No new AWS resources, no Terraform changes, no recurring
cost beyond a few cents of S3 GET traffic per query.

### Why DuckDB, not GoAccess

The initial brainstorm proposed GoAccess (text-log parser) because it's
the well-known zero-infra option. GoAccess can't read Parquet. The
options that *can* read these Parquet logs are:

1. **DuckDB** — local CLI, `read_parquet('s3://...')` with native Hive
   partition pruning, free, zero AWS resources. Same posture as the
   original GoAccess pitch (run locally, file-based queries, no
   infrastructure changes), just translated for the actual log format.
2. **Athena** — AWS-managed serverless SQL. Requires Glue DB + table +
   workgroup + a query-results S3 prefix in Terraform. ~$0.01/query
   here, but the maintenance surface is real (table schema drift, the
   `MSCK REPAIR TABLE` / partition-projection question, workgroup IAM).
3. **A Lambda + Parquet library** — overkill.

DuckDB wins on YAGNI grounds: identical capability to Athena at this
scale, none of the AWS-side state. If a use case ever emerges that
genuinely needs Athena (sharing queries via the AWS console, scheduling,
multi-user access), it can be added on top of the same Parquet files
later — the DuckDB queries translate near-verbatim.

### Why not skip a tool entirely (just use the AWS console)

The CloudWatch Logs console can preview Parquet objects but can't run
ad-hoc queries against them. The S3 console can only download. A query
tool is the minimum needed to answer the goal questions.

## Components

### `scripts/analytics/run.sh`

Single entry point. Stack-aware, matching the convention from
`scripts/tf.sh`.

```
./scripts/analytics/run.sh <stack> <query-name> [days=30]
```

- `<stack>` — `millsymills` or `p41m0n`. Maps to the bucket
  `<domain>-logs` and the corresponding `.tfvars`-derived domain. The
  script refuses any other value, same posture as `tf.sh`.
- `<query-name>` — basename (no `.sql`) of a file in
  `scripts/analytics/queries/`. Lists available queries when called with
  no `<query-name>` argument or with `--help`.
- `[days]` — passed to the query as a bind variable. Default 30. Caps at
  90 (current-retention ceiling on the logs bucket).

Behavior:

1. Validates `duckdb` is on `PATH`; prints `brew install duckdb` and
   exits non-zero if not.
2. Validates AWS credentials are available (`aws sts get-caller-identity`
   succeeds); prints how to refresh and exits non-zero if not. No
   AWS-region assumption — DuckDB reads cross-region S3 fine.
3. Renders the chosen SQL file with `<bucket>`, `<days>`, and
   `<since_partition>` substitutions (the last two so the query can use
   Hive partition pruning instead of scanning all 90 days).
4. Executes via `duckdb -c "..."` and streams the result table to
   stdout in a readable format. Markdown table by default; `--csv`
   flag for piping.
5. Exit code reflects DuckDB's exit code.

### `scripts/analytics/queries/*.sql`

One file per question. Each file is a self-contained DuckDB query that
uses bind variables for `<bucket>` and `<since_partition>`. Initial set:

- `top-urls.sql` — request count grouped by URI stem, descending.
- `errors.sql` — 4xx/5xx URIs with count, sorted by frequency.
- `status-distribution.sql` — count by HTTP status code.
- `referrers.sql` — request count by Referer header, descending,
  excluding same-origin.
- `user-agents.sql` — request count by User-Agent, descending, with an
  optional bot-like filter.
- `requests-over-time.sql` — count grouped by day.
- `path-hits.sql` — count for a specific path prefix passed as
  `<path>`.

Exact Parquet column names come from the v2 standard-logging schema and
are documented in `scripts/analytics/README.md` rather than here, so that
this design doc doesn't drift if AWS renames a column.

The queries are deliberately small and readable. They are not
abstracted into a "query framework" — three similar `SELECT count(*),
... FROM ... WHERE year >= ... GROUP BY ... ORDER BY ...` files is
better than one parameterised mega-template at this scale.

### `scripts/analytics/README.md`

Documents:

- Prereqs: `brew install duckdb`, valid AWS credentials.
- Usage and worked examples for each saved query.
- The log schema (column names, types) — sourced from
  [AWS docs on the v2 delivery framework's Parquet schema](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html).
  Reproducing the schema in our own docs is worth ~20 lines because the
  AWS doc page churns; the column names are stable, the page URL is
  not.
- "How to add a new query" — copy an existing `.sql`, edit, done.
- "How to escalate to Athena later if you ever want managed query
  history / shareable links" — one-paragraph pointer, not an
  implementation.

### `.gitignore`

Add `.cache/analytics/`. DuckDB itself writes nothing persistent unless
asked, but `run.sh` will optionally cache query outputs under that path
when invoked with `--save`. No production data leaves the workstation
to a tracked location.

## Data flow

```
operator workstation
  ↓ aws sts get-caller-identity (validate creds)
  ↓ duckdb -c "INSTALL httpfs; LOAD httpfs; SELECT ... FROM read_parquet('s3://<bucket>/.../year=2026/month=05/*.parquet', hive_partitioning=true) WHERE ...;"
  ↓
S3 GETs for matching partitions only (partition pruning means month/day
filters cut the scanned bytes by >95% vs naive full-bucket scan)
  ↓
result rows back to DuckDB → stdout
```

All data stays on the workstation. No new logging, no new collection,
no new external service.

## Privacy posture

Net-zero change vs the published privacy claim. Specifically:

- The CloudFront access logs the queries read **already exist**. The
  [privacy page](../../../src/data/privacy-copy.ts) already discloses
  them: *"cloudfront keeps standard access logs (url, ip, user-agent,
  timestamp, status code) in a private s3 bucket we own. they
  auto-expire after 90 days as the current version, plus up to another
  90 days as a noncurrent (recoverable) version, then they are gone."*
- Processing is local, on-demand, and never sends data anywhere.
- No client beacon → no CSP change required. `script-src 'self'` and
  `connect-src 'self'` remain literally true.
- No third-party fetch on any page → the `no-tracking` security
  control's claim of "no analytics, no cookies, no fingerprinting, no
  tag managers, no third-party scripts" remains literally true.

The privacy-copy and security-controls files are deliberately **not**
touched by this work. Adding the analytics tool is not a shipped public
control — it's an operator-side debugging affordance, in the same
category as `aws s3 ls` or `terraform plan`. There is no public-facing
surface to disclose or cite.

## Security-controls.ts

No entry. This is internal tooling, not a security control. Treating
it as one would dilute the page's "every entry is a load-bearing public
claim" property.

## Testing

CI is not required to run AWS queries (CI runners don't carry prod
credentials, by design — same constraint as
`scripts/verify-state-bucket.sh`, which is opt-in via
`MMS_VERIFY_STATE_BUCKET=true`). Tests instead verify the local shape
of the tool:

- `shellcheck scripts/analytics/run.sh` clean. Added to `ci-local.sh`
  alongside the other shellcheck invocations.
- `shfmt -d scripts/analytics/run.sh` clean.
- A syntax-check pass over every `.sql` in `queries/`. The implementation
  is free to choose the mechanism (e.g. `duckdb -c "EXPLAIN ..."` against
  an in-memory table shaped like the prod schema, or just `duckdb -c
  ".read <file>"` against a tiny committed sample Parquet). The goal is
  to catch column-name typos and obvious SQL errors without needing prod
  S3 credentials, gated on `duckdb` being installed locally.
- An end-to-end smoke (manual, documented in the README): run
  `./scripts/analytics/run.sh millsymills top-urls 7` against real
  prod logs and confirm output is non-empty and well-formed.

## Verification before considering this shipped

1. Run `./scripts/analytics/run.sh millsymills top-urls 30` against
   prod. Output is a sensible table with the homepage at or near the
   top.
2. Run the same against `p41m0n` for completeness. Confirm the
   stack-routing logic works even if traffic is sparse.
3. Verify partition pruning is happening: a 7-day query reads
   substantially less from S3 than a 90-day one. Spot-check via
   DuckDB's `EXPLAIN` output or `aws cloudwatch get-metric-statistics`
   on `BytesDownloaded` for the logs bucket.
4. `shellcheck`, `shfmt`, and the `--lint` self-check all pass in
   `ci-local.sh`.

## Out of scope (deferred until needed)

- **Athena.** Queryable via the AWS console, scheduling, multi-user
  access, query history. Not needed until one of those use cases is
  felt. The same `.sql` files port near-verbatim if/when that day
  comes.
- **Scheduled / email reports.** No cron, no SES delivery, no
  EventBridge schedule. Yagni until the operator notices they're
  manually re-running the same query weekly.
- **Geo enrichment.** MaxMind GeoLite2 + DuckDB join. Skipped per
  decision in brainstorm.
- **CSP-report dashboard.** The `csp_report` Lambda's reports go to
  CloudWatch Logs, not S3 access logs. Separate data source, separate
  tool. Out of scope.
- **Bot vs human classification beyond UA pattern matching.** The
  `user-agents.sql` query gives the operator the raw list; deeper
  classification can come later if traffic justifies it.
- **Cloudflare-protections follow-up issue.** Considered, dropped.
  AWS-only path + the existing security controls left the available CF
  protections set effectively empty. Decision recorded here so the
  question isn't re-litigated.

## Open questions

None at design time. Resolved during brainstorming:

- Architectural boundary for Cloudflare adoption → AWS-only.
- Analytics vs. privacy claim → preserve the claim; skip CF Analytics.
- Stack scope → both stacks supported by the script via the
  `<stack>` argument.
- Geo enrichment → skip in v1.
- Cloudflare protections issue → dropped.
