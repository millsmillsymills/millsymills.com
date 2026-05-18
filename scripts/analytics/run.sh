#!/usr/bin/env bash
#
# DuckDB query runner over CloudFront access logs (Parquet, Hive-partitioned).
#
# Usage:
#   ./scripts/analytics/run.sh <stack> <query-name> [days=30] [<path>]
#
# See scripts/analytics/README.md and
# docs/superpowers/specs/2026-05-17-cloudfront-analytics-design.md for the
# design and the available queries.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

QUERIES_DIR="scripts/analytics/queries"

usage() {
	cat <<'EOF'
usage: ./scripts/analytics/run.sh <stack> [<query-name>] [days=30] [<path>]

  <stack>       millsymills | p41m0n
  <query-name>  basename (no .sql) of a file under scripts/analytics/queries/
                run with just <stack> to list available queries
  [days]        lookback window. Default 30. Capped at 90 (current-retention
                ceiling on the logs bucket).
  [<path>]      URI-prefix bind value for queries that take one (e.g.
                path-hits). Refused for queries that don't reference <path>.
                Must start with `/` and contain only [A-Za-z0-9/_.-].

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

# Optional <path> positional, used by queries that take a URI-prefix bind
# value. Required iff the query SQL references <path>; refused for queries
# that don't (so typos surface instead of silently being ignored). Validate
# shape since the value reaches duckdb via sed substitution.
PATH_ARG="${1:-}"
if [[ -n "$PATH_ARG" ]]; then
	shift
fi
if grep -q '<path>' "$QUERY_FILE"; then
	if [[ -z "$PATH_ARG" ]]; then
		printf '\033[1;31mrefusing: query %q requires a path argument (e.g. /demo/passkey/)\033[0m\n' "$QUERY_NAME" >&2
		exit 2
	fi
	if ! [[ "$PATH_ARG" =~ ^/[A-Za-z0-9/_.-]*$ ]]; then
		printf '\033[1;31mrefusing: path must start with / and contain only [A-Za-z0-9/_.-], got %q\033[0m\n' "$PATH_ARG" >&2
		exit 2
	fi
elif [[ -n "$PATH_ARG" ]]; then
	printf '\033[1;31mrefusing: query %q does not accept a path argument, got %q\033[0m\n' "$QUERY_NAME" "$PATH_ARG" >&2
	exit 2
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

# Textual substitution into the query SQL. Bucket, date, and path values
# are validated above (stack whitelist, days = positive integer, path =
# constrained character set) so this is safe — no unconstrained
# operator-controlled string reaches duckdb.
SED_ARGS=(
	-e "s|<bucket>|${BUCKET}|g"
	-e "s|<since_date>|${SINCE_DATE}|g"
	-e "s|<days>|${DAYS}|g"
)
if [[ -n "$PATH_ARG" ]]; then
	SED_ARGS+=(-e "s|<path>|${PATH_ARG}|g")
fi
SQL=$(sed "${SED_ARGS[@]}" "$QUERY_FILE")

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
