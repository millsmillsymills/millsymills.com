# analytics

Local-only DuckDB query layer over CloudFront access logs (Parquet, Hive-partitioned).
No analytics beacon — queries run on the operator's workstation against logs that
already exist in S3. Design:
[`docs/superpowers/specs/2026-05-17-cloudfront-analytics-design.md`](../../docs/superpowers/specs/2026-05-17-cloudfront-analytics-design.md).

## Prereqs

- DuckDB CLI on PATH: `brew install duckdb`.
- AWS credentials that can `s3:GetObject` against the per-stack logs bucket
  (`<stack>.com-logs`). The admin profile carries this; the GitHub deploy role
  does not.

## Usage

```
./scripts/analytics/run.sh <stack> [<query-name>] [days=30]
```

- `<stack>` — `millsymills` or `p41m0n`.
- `<query-name>` — basename (no `.sql`) of a file under `queries/`. Run with
  just `<stack>` to list the available queries.
- `[days]` — lookback window. Default `30`. Capped at `90` (current-retention
  ceiling on the logs bucket).

Output is a markdown table to stdout.

### Worked example

```
./scripts/analytics/run.sh millsymills top-urls 30
```

Prints the top 50 URI stems by request count over the last 30 days.

## How to add a new query

1. Copy an existing file in `queries/`, rename to `<question>.sql`.
2. Use the `<bucket>`, `<since_year>`, `<since_month>`, `<since_day>` placeholders
   the same way `top-urls.sql` does. `run.sh` substitutes them textually before
   handing the SQL to DuckDB.
3. Run `./scripts/analytics/lint-queries.sh` to catch column-name typos against
   the fake schema (no AWS calls).
4. Smoke against prod: `./scripts/analytics/run.sh millsymills <question> 7`.

The queries are deliberately small and self-contained. Don't build a "query
framework" — three similar `SELECT count(*), ... FROM ... GROUP BY ... ORDER BY
...` files is better than one parameterised mega-template at this scale.

## Log schema (CloudFront v2 standard-logging Parquet)

Columns the queries reference. Names + types track the AWS schema; reproduced
here because the AWS doc page churns. Authoritative source:
<https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html>.

| column | type | meaning |
|---|---|---|
| `timestamp` | timestamp | event time (UTC) |
| `c_ip` | varchar | viewer IP |
| `c_country` | varchar | viewer country (CloudFront geo) |
| `cs_method` | varchar | request method |
| `cs_host` | varchar | request `Host` header |
| `cs_uri_stem` | varchar | request path (no query string) |
| `cs_uri_query` | varchar | query string |
| `cs_referer` | varchar | `Referer` header |
| `cs_user_agent` | varchar | `User-Agent` |
| `cs_bytes` | bigint | bytes received from the viewer |
| `sc_status` | integer | HTTP status code |
| `sc_bytes` | bigint | bytes sent to the viewer |
| `time_taken` | double | request latency (s) |
| `x_edge_result_type` | varchar | `Hit` / `Miss` / `RefreshHit` / `Error` / ... |

The bucket layout adds Hive-partition columns to every file path. DuckDB
exposes them as varchars when `hive_partitioning = true`:

```
s3://<stack>.com-logs/AWSLogs/aws-account-id=<id>/CloudFront/cloudfront-access/year=YYYY/month=MM/day=DD/hour=HH/<UUID>.parquet
```

CloudFront's v2 delivery framework auto-prepends `AWSLogs/aws-account-id=<id>/CloudFront/`
to the suffix path we configure (`cloudfront-access`) when the destination
bucket has no prefix; with `enable_hive_compatible_path = true` the account-id
segment renders as `aws-account-id=…` so partition discovery works in DuckDB /
Athena. See [AWS standard-logging docs § "Example paths to access logs"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html).

Queries that filter on `year` / `month` / `day` get partition pruning for free;
queries that don't will scan the full retention window (up to 90 days). Always
prefer the partition columns over `WHERE timestamp >= …`.

## Why DuckDB, not Athena

YAGNI. DuckDB has identical capability at this scale with no AWS-side state
(no Glue DB / table / workgroup / query-results bucket). If a use case ever
emerges that genuinely needs Athena — multi-user access, scheduling, shareable
query history — the same `queries/*.sql` files port near-verbatim: define a
Glue table over the existing Parquet, point Athena at it, run.

## CI

`scripts/ci-local.sh` runs:

- `shellcheck` + `shfmt -d` over `run.sh` and `lint-queries.sh`
- `lint-queries.sh` parse-checks every `queries/*.sql` against a fake schema.
  Gated on local `duckdb` install; skipped silently if absent.

No end-to-end smoke in CI (no prod credentials on CI runners by design).
Manual smoke: `./scripts/analytics/run.sh millsymills top-urls 7`.
