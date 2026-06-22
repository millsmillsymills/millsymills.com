#!/usr/bin/env bash
#
# DuckDB query runner over CloudFront access logs (Parquet, Hive-partitioned).
#
# Usage:
#   ./scripts/analytics/run.sh <stack> <query-name> [days=30] [<path>] [--csv] [--save]
#
# See scripts/analytics/README.md and
# docs/superpowers/specs/2026-05-17-cloudfront-analytics-design.md for the
# design and the available queries.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

QUERIES_DIR="scripts/analytics/queries"

# Strip `--`-prefixed flags out of $@ up front so positionals (stack,
# query, days, path) can be in any order with the flags. Without this
# split, `... top-urls --csv 30` would fail (the days-parser would see
# --csv and the flag-loop would see 30), even though the operator's
# intent is obvious.
EMIT_CSV=0
SAVE=0
SHOW_HELP=0
SINCE=""
HOURS=""
POSITIONALS=()
while (($#)); do
	case "$1" in
		--csv) EMIT_CSV=1 ;;
		--save) SAVE=1 ;;
		-h | --help) SHOW_HELP=1 ;;
		--hours)
			if (($# < 2)) || [[ "$2" == --* ]]; then
				printf '\033[1;31mrefusing: --hours requires a value\033[0m\n' >&2
				exit 2
			fi
			shift
			HOURS="$1"
			;;
		--hours=)
			printf '\033[1;31mrefusing: --hours requires a value\033[0m\n' >&2
			exit 2
			;;
		--hours=*) HOURS="${1#*=}" ;;
		--since)
			if (($# < 2)) || [[ "$2" == --* ]]; then
				printf '\033[1;31mrefusing: --since requires a value\033[0m\n' >&2
				exit 2
			fi
			shift
			SINCE="$1"
			;;
		--since=)
			printf '\033[1;31mrefusing: --since requires a value\033[0m\n' >&2
			exit 2
			;;
		--since=*) SINCE="${1#*=}" ;;
		--*)
			printf '\033[1;31mrefusing: unknown flag %q (expected --csv, --save, --hours, --since, --help)\033[0m\n' "$1" >&2
			exit 2
			;;
		*) POSITIONALS+=("$1") ;;
	esac
	shift
done
set -- "${POSITIONALS[@]+"${POSITIONALS[@]}"}"

usage() {
	cat <<'EOF'
usage: ./scripts/analytics/run.sh <stack> [<query-name>] [days=30] [<path>] [--hours N] [--since "T"] [--csv] [--save]

  <stack>       millsymills
  <query-name>  basename (no .sql) of a file under scripts/analytics/queries/
                run with just <stack> to list available queries
  [days]        lookback window. Default 30. Capped at 90 (current-retention
                ceiling on the logs bucket).
  --hours N     window = now - N hours (UTC). Mutually exclusive with --since.
  --since "T"   window start at local time T ("YYYY-MM-DD HH:MM"), converted
                to UTC. Mutually exclusive with --hours. Overrides [days].
  [<path>]      URI-prefix bind value for queries that take one (e.g.
                path-hits). Refused for queries that don't reference <path>.
                Must start with `/` and contain only [A-Za-z0-9/_.-].
  --csv         emit DuckDB CSV instead of the default markdown table.
  --save        also write the rendered output to
                .cache/analytics/<stack>-<query>-<UTC-timestamp>.{md,csv}.
                stdout is unchanged; the file is a copy in the active format.

Output is a markdown table to stdout by default.
EOF
}

if ((SHOW_HELP)); then
	usage
	exit 0
fi

STACK="${1:-}"
shift || true

case "$STACK" in
	millsymills) ;;
	"" | help)
		usage
		exit 0
		;;
	*)
		printf '\033[1;31mrefusing: stack must be one of [millsymills], got %q\033[0m\n' "$STACK" >&2
		exit 2
		;;
esac

DOMAIN="${STACK}.com"
BUCKET="${DOMAIN}-logs"

if [[ -n "$HOURS" && -n "$SINCE" ]]; then
	printf '\033[1;31mrefusing: --hours and --since are mutually exclusive\033[0m\n' >&2
	exit 2
fi
if [[ -n "$HOURS" ]] && { ! [[ "$HOURS" =~ ^[0-9]+$ ]] || ((HOURS == 0)); }; then
	printf '\033[1;31mrefusing: --hours must be a positive integer, got %q\033[0m\n' "$HOURS" >&2
	exit 2
fi
if [[ -n "$SINCE" ]] && ! [[ "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}$ ]]; then
	printf '\033[1;31mrefusing: --since must be "YYYY-MM-DD HH:MM" (local time), got %q\033[0m\n' "$SINCE" >&2
	exit 2
fi

QUERY_NAME="${1:-}"
shift || true

if [[ -z "$QUERY_NAME" ]]; then
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

# DAYS is the next positional. Flags were already split out of $@ above.
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

if (($# > 0)); then
	printf '\033[1;31mrefusing: trailing positional %q (expected at most: <stack> <query> [days] [<path>])\033[0m\n' "$1" >&2
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

# Resolve the window cutoff. Precedence: --since > --hours > days default.
# SINCE_TS is the exact UTC cutoff (YYYY-MM-DD HH:MM:SS); SINCE_DATE is its
# UTC day-floor, kept for Parquet row-group pruning. Python3 (already a
# dependency) handles tz math portably across BSD/GNU coreutils.
if [[ -n "$SINCE" ]]; then
	SINCE_TS=$(python3 -c "
from datetime import datetime
from zoneinfo import ZoneInfo
print(datetime.strptime('${SINCE}', '%Y-%m-%d %H:%M').astimezone().astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%d %H:%M:%S'))
")
	SINCE_DATE="${SINCE_TS%% *}"
elif [[ -n "$HOURS" ]]; then
	SINCE_TS=$(python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(hours=${HOURS})).strftime('%Y-%m-%d %H:%M:%S'))
")
	SINCE_DATE="${SINCE_TS%% *}"
else
	SINCE_DATE=$(python3 -c "
from datetime import date, timedelta
print((date.today() - timedelta(days=${DAYS})).isoformat())
")
	SINCE_TS="${SINCE_DATE} 00:00:00"
fi

# Textual substitution into the query SQL. Bucket, date, and path values
# are validated above (stack whitelist, days = positive integer, path =
# constrained character set) so this is safe — no unconstrained
# operator-controlled string reaches duckdb.
SED_ARGS=(
	-e "s|<bucket>|${BUCKET}|g"
	-e "s|<since_date>|${SINCE_DATE}|g"
	-e "s|<since_ts>|${SINCE_TS}|g"
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
CLASSIFY_SQL=$(cat "${QUERIES_DIR%/queries}/lib/classify.sql")

FULL_SQL="
INSTALL httpfs;
LOAD httpfs;
CREATE OR REPLACE SECRET cloudfront_logs (
	TYPE S3,
	PROVIDER credential_chain,
	REGION 'us-west-2',
	URL_STYLE 'path'
);
${CLASSIFY_SQL}
${SQL}
"

if ((EMIT_CSV)); then
	FMT_FLAG="-csv"
	EXT="csv"
else
	FMT_FLAG="-markdown"
	EXT="md"
fi

if ((SAVE)); then
	mkdir -p .cache/analytics
	TS=$(date -u +%Y%m%dT%H%M%SZ)
	SAVE_PATH=".cache/analytics/${STACK}-${QUERY_NAME}-${TS}.${EXT}"
	# `tee` duplicates duckdb's stdout to the save path; the script's
	# `set -o pipefail` preserves duckdb's exit code through the pipe.
	duckdb "$FMT_FLAG" -c "$FULL_SQL" | tee "$SAVE_PATH"
	printf '\033[2msaved: %s\033[0m\n' "$SAVE_PATH" >&2
else
	duckdb "$FMT_FLAG" -c "$FULL_SQL"
fi
