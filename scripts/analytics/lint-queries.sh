#!/usr/bin/env bash
#
# Parse-check every scripts/analytics/queries/*.sql against a fake schema
# shaped like the CloudFront v2 standard-logging Parquet output. Catches
# column-name typos and obvious SQL errors without needing prod S3 creds.
#
# Gated on `duckdb` being installed locally — CI runners don't carry duckdb
# by default, same posture as scripts/verify-state-bucket.sh.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v duckdb >/dev/null 2>&1; then
	printf '\033[2mskipped (install: brew install duckdb)\033[0m\n'
	exit 0
fi

# Stand-in for read_parquet('s3://...') matching the column names + types
# our queries reference. Add columns here when a query references a new one.
FAKE_SCHEMA="
CREATE OR REPLACE TEMP VIEW fake_logs AS
SELECT
	CAST(NULL AS VARCHAR)   AS cs_uri_stem,
	CAST(NULL AS VARCHAR)   AS cs_uri_query,
	CAST(NULL AS VARCHAR)   AS cs_method,
	CAST(NULL AS VARCHAR)   AS cs_host,
	CAST(NULL AS VARCHAR)   AS cs_referer,
	CAST(NULL AS VARCHAR)   AS cs_user_agent,
	CAST(NULL AS VARCHAR)   AS c_ip,
	CAST(NULL AS VARCHAR)   AS c_country,
	CAST(NULL AS INTEGER)   AS sc_status,
	CAST(NULL AS BIGINT)    AS sc_bytes,
	CAST(NULL AS BIGINT)    AS cs_bytes,
	CAST(NULL AS DOUBLE)    AS time_taken,
	CAST(NULL AS VARCHAR)   AS x_edge_result_type,
	CAST(NULL AS TIMESTAMP) AS \"timestamp\",
	CAST(NULL AS VARCHAR)   AS year,
	CAST(NULL AS VARCHAR)   AS month,
	CAST(NULL AS VARCHAR)   AS day,
	CAST(NULL AS VARCHAR)   AS hour
WHERE 1 = 0;
"

fail=0
for q in scripts/analytics/queries/*.sql; do
	[[ -f "$q" ]] || continue

	# Rewrite the read_parquet(...) call to point at the fake view. The
	# call spans multiple lines for readability, so slurp the file and use
	# a non-greedy match on a balanced single set of parentheses.
	rewritten=$(perl -0777 -pe 's/read_parquet\s*\([^()]*\)/fake_logs/gs' "$q")

	# Substitute stand-ins for runtime bind values.
	rewritten=${rewritten//<bucket>/example-bucket}
	rewritten=${rewritten//<since_year>/2026}
	rewritten=${rewritten//<since_month>/1}
	rewritten=${rewritten//<since_day>/1}
	rewritten=${rewritten//<days>/30}
	rewritten=${rewritten//<path>/\/example\/}

	if duckdb -c "${FAKE_SCHEMA} EXPLAIN ${rewritten}" >/dev/null 2>&1; then
		printf '\033[1;32m✓ %s\033[0m\n' "$q"
	else
		printf '\033[1;31m✗ %s\033[0m\n' "$q" >&2
		duckdb -c "${FAKE_SCHEMA} EXPLAIN ${rewritten}" 2>&1 | sed 's/^/    /' >&2 || true
		fail=1
	fi
done

exit "$fail"
