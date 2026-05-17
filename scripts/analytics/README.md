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

Every column AWS writes is `VARCHAR`. Cast in SQL where queries need numeric
or date semantics. Authoritative source (column meanings):
<https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html>.

| column | meaning |
|---|---|
| `date` | request date (ISO `YYYY-MM-DD`, UTC) |
| `time` | request time (`HH:MM:SS`, UTC) |
| `x_edge_location` | edge location code (`SEA19-C2` etc.) |
| `c_ip` | viewer IP |
| `cs_method` | request method |
| `cs_Host` | request `Host` header |
| `cs_uri_stem` | request path (no query string) |
| `cs_uri_query` | query string |
| `cs_Referer` | `Referer` header |
| `cs_User_Agent` | `User-Agent` |
| `cs_Cookie` | request cookies (always `-` here; cache policy strips them) |
| `cs_protocol` / `cs_protocol_version` | scheme + HTTP version |
| `cs_bytes` / `sc_bytes` | bytes in / out |
| `sc_status` | HTTP status code (cast to INT for ranges) |
| `time_taken` / `time_to_first_byte` | latency (s, cast to DOUBLE) |
| `x_edge_result_type` / `x_edge_response_result_type` | `Hit` / `Miss` / `RefreshHit` / `Error` / ... |
| `x_edge_detailed_result_type` | finer-grained edge outcome |
| `x_edge_request_id` | CloudFront request id |
| `x_host_header` | `:authority` |
| `x_forwarded_for` | XFF |
| `ssl_protocol` / `ssl_cipher` | negotiated TLS params |

Note: column names are mixed-case (`cs_Host`, `cs_Referer`, `cs_User_Agent`,
`cs_Cookie`). Quote them or match exactly.

The S3 path layout is:

```
s3://<stack>.com-logs/AWSLogs/aws-account-id=<id>/CloudFront/cloudfront-access/<distId>.<YYYY-MM-DD-HH>.<hash>.parquet
```

CloudFront's v2 delivery framework auto-prepends `AWSLogs/aws-account-id=<id>/CloudFront/`
to the suffix path we configure (`cloudfront-access`) when the destination
bucket has no prefix; with `enable_hive_compatible_path = true` the account-id
segment renders as `aws-account-id=…` so DuckDB / Athena pick it up as a
hive-partition column. See [AWS standard-logging docs § "Example paths to access logs"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logging.html).

`aws-account-id` is the only hive-partition column on this layout; year /
month / day are NOT in the path. Use `WHERE date >= '<YYYY-MM-DD>'` to scope
the window (the `date` column is an ISO string, so lexical compare is correct).
DuckDB pushes the predicate into the Parquet reader and skips row groups whose
date bounds fall outside the window — that's where the speedup comes from at
this scale.

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
