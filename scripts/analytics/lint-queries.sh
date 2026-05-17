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

# Stand-in for read_parquet('s3://...') matching the v2 Parquet schema +
# the `aws-account-id` hive-partition column. All native columns are
# VARCHAR in the AWS schema; cast in SQL where queries need numeric / date
# semantics. Add columns here when a query references a new one.
FAKE_SCHEMA="
CREATE OR REPLACE TEMP VIEW fake_logs AS
SELECT
	CAST(NULL AS VARCHAR) AS \"date\",
	CAST(NULL AS VARCHAR) AS \"time\",
	CAST(NULL AS VARCHAR) AS x_edge_location,
	CAST(NULL AS VARCHAR) AS sc_bytes,
	CAST(NULL AS VARCHAR) AS c_ip,
	CAST(NULL AS VARCHAR) AS cs_method,
	CAST(NULL AS VARCHAR) AS cs_Host,
	CAST(NULL AS VARCHAR) AS cs_uri_stem,
	CAST(NULL AS VARCHAR) AS sc_status,
	CAST(NULL AS VARCHAR) AS cs_Referer,
	CAST(NULL AS VARCHAR) AS cs_User_Agent,
	CAST(NULL AS VARCHAR) AS cs_uri_query,
	CAST(NULL AS VARCHAR) AS cs_Cookie,
	CAST(NULL AS VARCHAR) AS x_edge_result_type,
	CAST(NULL AS VARCHAR) AS x_edge_request_id,
	CAST(NULL AS VARCHAR) AS x_host_header,
	CAST(NULL AS VARCHAR) AS cs_protocol,
	CAST(NULL AS VARCHAR) AS cs_bytes,
	CAST(NULL AS VARCHAR) AS time_taken,
	CAST(NULL AS VARCHAR) AS time_to_first_byte,
	CAST(NULL AS VARCHAR) AS ssl_protocol,
	CAST(NULL AS VARCHAR) AS ssl_cipher,
	CAST(NULL AS VARCHAR) AS x_edge_response_result_type,
	CAST(NULL AS VARCHAR) AS cs_protocol_version,
	CAST(NULL AS VARCHAR) AS c_port,
	CAST(NULL AS VARCHAR) AS x_edge_detailed_result_type,
	CAST(NULL AS VARCHAR) AS sc_content_type,
	CAST(NULL AS VARCHAR) AS sc_content_len,
	CAST(NULL AS VARCHAR) AS \"aws-account-id\"
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
	rewritten=${rewritten//<since_date>/2026-01-01}
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
