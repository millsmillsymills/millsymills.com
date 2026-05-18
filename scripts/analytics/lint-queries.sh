#!/usr/bin/env bash
#
# Parse-check every scripts/analytics/queries/*.sql against a fake schema
# shaped like the CloudFront v2 standard-logging Parquet output. Catches
# column-name typos, function-signature mismatches, and runtime cast
# failures without needing prod S3 creds.
#
# Two design choices keep this honest:
#   - Type-aware fake schema. Columns carry their real semantic type
#     (DATE for `date`, TIME for `time`, INTEGER for `sc_status`,
#     DOUBLE for `time_taken` / `time_to_first_byte`, etc.) so a query
#     like `date_trunc('hour', time)` against a VARCHAR fake — which
#     would have plan-checked clean — is now caught at the binder.
#   - One sentinel row + EXPLAIN ANALYZE. An empty-result view short-
#     circuits cast operators at runtime; a single non-NULL row that
#     satisfies every existing WHERE clause forces DuckDB to evaluate
#     every cast and function call, so `sc_status::DATE` and friends
#     fail loud instead of passing silently.
#
# Gated on `duckdb` being installed locally — CI runners don't carry duckdb
# by default, same posture as scripts/verify-state-bucket.sh.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v duckdb >/dev/null 2>&1; then
	printf '\033[2mskipped (install: brew install duckdb)\033[0m\n'
	exit 0
fi

# Sentinel values are chosen so each existing query's WHERE clause
# admits the single row: date matches `<since_date>` (2026-01-01),
# cs_uri_stem matches `<path>%` (/example/), sc_status >= 400 for the
# errors filter, cs_Referer is a non-host-aligned external referer for
# the referrers filter, cs_User_Agent != '-'.
FAKE_SCHEMA="
CREATE OR REPLACE TEMP VIEW fake_logs AS
SELECT
	CAST('2026-01-01' AS DATE)             AS \"date\",
	CAST('00:00:00' AS TIME)               AS \"time\",
	CAST('IAD12-C1' AS VARCHAR)            AS x_edge_location,
	CAST(0 AS BIGINT)                      AS sc_bytes,
	CAST('0.0.0.0' AS VARCHAR)             AS c_ip,
	CAST('GET' AS VARCHAR)                 AS cs_method,
	CAST('example.com' AS VARCHAR)         AS cs_Host,
	CAST('/example/test' AS VARCHAR)       AS cs_uri_stem,
	CAST(500 AS INTEGER)                   AS sc_status,
	CAST('https://other.com/' AS VARCHAR)  AS cs_Referer,
	CAST('GoogleBot/2.0' AS VARCHAR)       AS cs_User_Agent,
	CAST('' AS VARCHAR)                    AS cs_uri_query,
	CAST('-' AS VARCHAR)                   AS cs_Cookie,
	CAST('Hit' AS VARCHAR)                 AS x_edge_result_type,
	CAST('req-123' AS VARCHAR)             AS x_edge_request_id,
	CAST('example.com' AS VARCHAR)         AS x_host_header,
	CAST('https' AS VARCHAR)               AS cs_protocol,
	CAST(0 AS BIGINT)                      AS cs_bytes,
	CAST(0.0 AS DOUBLE)                    AS time_taken,
	CAST(0.0 AS DOUBLE)                    AS time_to_first_byte,
	CAST('TLSv1.3' AS VARCHAR)             AS ssl_protocol,
	CAST('TLS_AES_128_GCM_SHA256' AS VARCHAR) AS ssl_cipher,
	CAST('Hit' AS VARCHAR)                 AS x_edge_response_result_type,
	CAST('HTTP/2.0' AS VARCHAR)            AS cs_protocol_version,
	CAST(0 AS INTEGER)                     AS c_port,
	CAST('Hit' AS VARCHAR)                 AS x_edge_detailed_result_type,
	CAST('text/html' AS VARCHAR)           AS sc_content_type,
	CAST(0 AS BIGINT)                      AS sc_content_len,
	CAST('123456789012' AS VARCHAR)        AS \"aws-account-id\";
"

fail=0
for q in scripts/analytics/queries/*.sql; do
	[[ -f "$q" ]] || continue

	# Rewrite read_parquet(...) → fake_logs. The argument list spans
	# multiple lines and itself contains nested parens (e.g.
	# `list_value('a', 'b')` for multi-bucket fanout), so a flat
	# `[^()]*` character class would silently fail to match and leave
	# the real call in place — which then hits S3-credential errors
	# rather than producing a useful lint diagnostic. The recursive
	# `(?1)` reference balances parens to arbitrary depth.
	rewritten=$(perl -0777 -pe 's/read_parquet\s*(\((?:[^()]|(?1))*\))/fake_logs/gs' "$q")

	# Substitute stand-ins for runtime bind values.
	rewritten=${rewritten//<bucket>/example-bucket}
	rewritten=${rewritten//<since_date>/2026-01-01}
	rewritten=${rewritten//<days>/30}
	rewritten=${rewritten//<path>/\/example\/}

	if duckdb -c "${FAKE_SCHEMA} EXPLAIN ANALYZE ${rewritten}" >/dev/null 2>&1; then
		printf '\033[1;32m✓ %s\033[0m\n' "$q"
	else
		printf '\033[1;31m✗ %s\033[0m\n' "$q" >&2
		duckdb -c "${FAKE_SCHEMA} EXPLAIN ANALYZE ${rewritten}" 2>&1 | sed 's/^/    /' >&2 || true
		fail=1
	fi
done

exit "$fail"
