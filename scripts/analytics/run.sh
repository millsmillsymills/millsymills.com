#!/usr/bin/env bash
#
# DuckDB query runner over CloudFront access logs (Parquet, Hive-partitioned).
#
# Usage:
#   ./scripts/analytics/run.sh <stack> <query-name> [days=30]
#
# See scripts/analytics/README.md and
# docs/superpowers/specs/2026-05-17-cloudfront-analytics-design.md for the
# design and the available queries.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

QUERIES_DIR="scripts/analytics/queries"

usage() {
	cat <<'EOF'
usage: ./scripts/analytics/run.sh <stack> [<query-name>] [days=30]

  <stack>       millsymills | p41m0n
  <query-name>  basename (no .sql) of a file under scripts/analytics/queries/
                run with just <stack> to list available queries
  [days]        lookback window. Default 30. Capped at 90 (current-retention
                ceiling on the logs bucket).

Output is a markdown table to stdout.
EOF
}

STACK="${1:-}"
shift || true

case "$STACK" in
	millsymills | p41m0n) ;;
	"" | -h | --help | help)
		usage
		exit 0
		;;
	*)
		printf '\033[1;31mrefusing: stack must be one of [millsymills, p41m0n], got %q\033[0m\n' "$STACK" >&2
		exit 2
		;;
esac

DOMAIN="${STACK}.com"
BUCKET="${DOMAIN}-logs"

QUERY_NAME="${1:-}"
shift || true

if [[ -z "$QUERY_NAME" || "$QUERY_NAME" == "--help" || "$QUERY_NAME" == "-h" ]]; then
	printf 'available queries:\n'
	for q in "$QUERIES_DIR"/*.sql; do
		[[ -f "$q" ]] || continue
		printf '  %s\n' "$(basename "$q" .sql)"
	done
	exit 0
fi

QUERY_FILE="${QUERIES_DIR}/${QUERY_NAME}.sql"
if [[ ! -f "$QUERY_FILE" ]]; then
	printf '\033[1;31mrefusing: no query named %q (expected %s)\033[0m\n' "$QUERY_NAME" "$QUERY_FILE" >&2
	exit 2
fi

DAYS="${1:-30}"
shift || true
if ! [[ "$DAYS" =~ ^[0-9]+$ ]] || ((DAYS == 0)); then
	printf '\033[1;31mrefusing: days must be a positive integer, got %q\033[0m\n' "$DAYS" >&2
	exit 2
fi
if ((DAYS > 90)); then
	printf '\033[1;33mnote: days capped at 90 (current-retention ceiling)\033[0m\n' >&2
	DAYS=90
fi

if ! command -v duckdb >/dev/null 2>&1; then
	printf '\033[1;31mrefusing: duckdb not on PATH. Install: brew install duckdb\033[0m\n' >&2
	exit 127
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
	printf '\033[1;31mrefusing: aws sts get-caller-identity failed — refresh credentials, e.g.:\033[0m\n' >&2
	# shellcheck disable=SC2016
	printf '  eval "$(aws configure export-credentials --format env-no-export | sed '\''s/^/export /'\'')"\n' >&2
	exit 1
fi

# Compute the since-date ISO string for `today - DAYS`.  The v2 Parquet
# logs carry the date as a varchar in the `date` column (YYYY-MM-DD), so a
# lexical compare against this ISO string is correct without parsing.
# Python over `date` to stay portable across BSD (macOS) and GNU (CI) coreutils.
SINCE_DATE=$(
	python3 -c "
from datetime import date, timedelta
print((date.today() - timedelta(days=${DAYS})).isoformat())
"
)

# Textual substitution into the query SQL. Bucket and date values are
# validated above (stack whitelist; days is a positive integer) so this is
# safe — no operator-controlled string reaches duckdb.
SQL=$(
	sed \
		-e "s|<bucket>|${BUCKET}|g" \
		-e "s|<since_date>|${SINCE_DATE}|g" \
		-e "s|<days>|${DAYS}|g" \
		"$QUERY_FILE"
)

# httpfs is the DuckDB extension that lets read_parquet() resolve s3:// URLs.
# INSTALL + LOAD are idempotent.
#
# `CREATE SECRET ... PROVIDER credential_chain` walks the AWS SDK credential
# chain (env vars → AWS_PROFILE → ~/.aws/credentials → IMDS); the bare
# `SET s3_access_key_id` form doesn't, so AWS_PROFILE wouldn't be honoured
# without the secret.
#
# `URL_STYLE 'path'` is required because the bucket name contains dots
# (`<domain>-logs` → `millsymills.com-logs`); virtual-hosted style would
# resolve to `https://millsymills.com-logs.s3.amazonaws.com/`, which fails
# certificate validation against the `*.s3.amazonaws.com` wildcard.
#
# `REGION 'us-west-2'` matches the primary region declared in
# `infra/variables.tf` (and the logs bucket's actual `LocationConstraint`).
duckdb -markdown -c "
INSTALL httpfs;
LOAD httpfs;
CREATE OR REPLACE SECRET cloudfront_logs (
	TYPE S3,
	PROVIDER credential_chain,
	REGION 'us-west-2',
	URL_STYLE 'path'
);
${SQL}
"
