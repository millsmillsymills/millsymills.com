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
./scripts/analytics/run.sh <stack> [<query-name>] [days=30] [<path>] [--hours N] [--since "T"] [--csv] [--save]
```

- `<stack>` — `millsymills`.
- `<query-name>` — basename (no `.sql`) of a file under `queries/`. Run with
  just `<stack>` to list the available queries.
- `[days]` — lookback window. Default `30`. Capped at `90` (current-retention
  ceiling on the logs bucket). Required positionally if you also pass a `<path>`.
- `[<path>]` — URI-prefix bind value for queries that take one (currently
  `path-hits`). Must start with `/` and contain only `[A-Za-z0-9/_.-]`. Refused
  for queries that don't reference `<path>` so typos surface.
- `--hours N` — sub-day lookback: query the last N hours of logs. Mutually
  exclusive with `--since`; overrides `[days]`. The runner converts to a UTC
  `<since_ts>` before handing to DuckDB.
- `--since "YYYY-MM-DD HH:MM"` — query from a specific local timestamp forward.
  Mutually exclusive with `--hours`; overrides `[days]`. Local time is converted
  to UTC by the runner. Calendar-impossible values (e.g. `2026-02-30 10:00`) are
  refused with a styled message, not a raw traceback.

When a window flag (`--hours`/`--since`) is given alongside an explicitly-typed
`[days]`, the runner prints a `note:` that the `[days]` value was overridden, so
the shadowed value isn't dropped silently.
- `--csv` — emit DuckDB CSV instead of the default markdown table. Pipe-friendly
  (`| q -H -d, "SELECT ..."`, `| ddgrep`, etc.). Can appear anywhere in `$@`.
- `--save` — also write the rendered output to
  `.cache/analytics/<stack>-<query>-<UTC-timestamp>.{md,csv}`. Stdout is
  unchanged; the file is a copy in the active format. Directory is created
  on demand. `.cache/analytics/` is gitignored. Can appear anywhere in `$@`.

Output is a markdown table to stdout by default. Combine `--csv --save` to
get CSV in both places.

### Worked examples

```
./scripts/analytics/run.sh millsymills top-urls 30
```

Top 50 URI stems by request count over the last 30 days as a markdown table.

```
./scripts/analytics/run.sh millsymills errors 7
```

4xx/5xx URIs over the last 7 days, with hit count and a representative status
code per path. Useful for spotting a sudden 404 spike after a rename or a
single endpoint throwing 5xx.

```
./scripts/analytics/run.sh millsymills status-distribution 30
```

Count of requests per HTTP status code. Quick sanity check on the
healthy-vs-error ratio across the window.

```
./scripts/analytics/run.sh millsymills referrers 30
```

Top external referrers (same-origin navigations are filtered out via a
`Referer`-host vs `cs_Host` compare). Surfaces aggregator pickups and
crawler entry points.

```
./scripts/analytics/run.sh millsymills user-agents 7
```

Top User-Agent strings with an `is_bot` flag from a substring scan
(`bot|crawler|spider|slurp|wget|curl|httpclient|httpx|python-requests|libwww|scrapy|headlesschrome`).
Heuristic only — the operator eyeballs the list.

```
./scripts/analytics/run.sh millsymills requests-over-time 30
```

Requests per calendar day. Pair with `top-urls` to confirm whether a spike
is broad traffic or one URL.

```
./scripts/analytics/run.sh millsymills path-hits 30 /demo/passkey/
```

Hits whose URI stem starts with `/demo/passkey/`, grouped by exact stem. Pass
a trailing slash for directory semantics; omit it for any URI starting with
that string.

```
./scripts/analytics/run.sh millsymills top-urls 7 --csv | column -t -s,
```

Pretty-prints the CSV output for quick eyeballing in a terminal.

```
./scripts/analytics/run.sh millsymills top-urls 30 --save
```

Markdown table to stdout AND copy at
`.cache/analytics/millsymills-top-urls-<UTC-timestamp>.md` for sharing in
a PR description or pasting into a notebook.

```
./scripts/analytics/run.sh millsymills bot-split --since "2026-06-18 22:00"
```

Automated vs human split (requests, unique IPs, 2xx vs 404) since 10pm local
on 2026-06-18. `--hours N` and `--since "YYYY-MM-DD HH:MM"` (local→UTC) give
sub-day windows; omit both for the whole-day `days` lookback.

```
./scripts/analytics/run.sh millsymills geography 7
```

Requests + unique IPs by edge POP, decoded via `edge-locations.csv`. Edge POP
is a proxy for viewer region, not a geo-IP lookup. Ordered by unique IPs since
single-IP bots inflate request counts.

```
./scripts/analytics/run.sh millsymills device-split 7
./scripts/analytics/run.sh millsymills deep-sessions 7
```

Device class (mobile/tablet/desktop/bot) and engaged visitors (≥3 distinct
`/_astro/*.js` bundles). Both are UA-based heuristics — deep-sessions is
best-effort and can include browser-UA-spoofing scanners.

## How to add a new query

1. Copy an existing file in `queries/`, rename to `<question>.sql`.
2. Use the `<bucket>`, `<since_date>`, `<days>` placeholders the same way
   `top-urls.sql` does. `run.sh` substitutes them textually before handing the
   SQL to DuckDB. If the query needs a URI-prefix bind value, reference
   `<path>` — `run.sh` then requires the operator to pass a path positional
   after `<days>` (and refuses one for queries that don't reference `<path>`).
3. Run `./scripts/analytics/lint-queries.sh` to catch column-name typos against
   the fake schema (no AWS calls).
4. Smoke against prod: `./scripts/analytics/run.sh millsymills <question> 7`.

The queries are deliberately small and self-contained. Don't build a "query
framework" — three similar `SELECT count(*), ... FROM ... GROUP BY ... ORDER BY
...` files is better than one parameterised mega-template at this scale.

### Shared classifier

`lib/classify.sql` defines the `is_automated(ua)` macro — the single source of
truth for human/bot classification. `run.sh` and `lint-queries.sh` both prepend
it, so any query can call it. Add a new scanner by extending the alternation
there; it is UA-based and will under-count UAs that spoof a browser.

### edge-locations.csv

`pop,city,country` decode table for `geography`. Unknown POPs fall through to
the raw code, so it degrades gracefully and is updated lazily as AWS adds POPs.

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
