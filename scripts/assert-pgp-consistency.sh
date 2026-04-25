#!/usr/bin/env bash
#
# Assert the three sources of truth for the PGP key all agree:
#   1. fingerprint declared in src/data/pgp.ts
#   2. armored key at public/pgp.asc
#   3. WKD binary at public/.well-known/openpgpkey/hu/<zbase32>
#
# Drift between any two means a key rotation was botched: e.g. pgp.asc was
# regenerated without re-running scripts/generate-wkd.sh, so WKD lookups
# return a stale key. Catches the failure at PR time instead of in
# production after a rotation.
#
# Requires gpg in $PATH (already a dev requirement — generate-wkd.sh uses it).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PGP_TS="src/data/pgp.ts"
PGP_ASC="public/pgp.asc"
WKD_DIR="public/.well-known/openpgpkey/hu"

printf '\n\033[1;36m== assert-pgp-consistency ==\033[0m\n'

if ! command -v gpg >/dev/null 2>&1; then
	printf '\033[1;31m✗ gpg not found in PATH\033[0m\n' >&2
	exit 1
fi

# 1. Fingerprint from pgp.ts. The literal in the file is space-separated
# (display format); strip whitespace to compare against gpg's compact form.
ts_fpr_raw=$(grep -oE "fingerprint:[[:space:]]*'[^']+'" "$PGP_TS" | sed -E "s/.*'([^']+)'.*/\1/")
ts_fpr=$(printf '%s' "$ts_fpr_raw" | tr -d '[:space:]')
if [[ -z "$ts_fpr" || ${#ts_fpr} -ne 40 ]]; then
	printf '\033[1;31m✗ could not parse fingerprint from %s (got %s chars)\033[0m\n' "$PGP_TS" "${#ts_fpr}" >&2
	exit 1
fi

# 2. Fingerprint from pgp.asc via gpg --show-keys (does not modify keyring).
if [[ ! -f "$PGP_ASC" ]]; then
	printf '\033[1;31m✗ %s missing\033[0m\n' "$PGP_ASC" >&2
	exit 1
fi
# Anchor on the `pub` record so we always read the PRIMARY key's fpr,
# never a subkey's. gpg lists pub before its subkeys, so the first fpr
# after pub is the primary fingerprint.
asc_fpr=$(gpg --show-keys --with-colons "$PGP_ASC" 2>/dev/null \
	| awk -F: '$1=="pub"{seen=1} seen && $1=="fpr"{print $10; exit}')
if [[ -z "$asc_fpr" ]]; then
	printf '\033[1;31m✗ could not parse fingerprint from %s\033[0m\n' "$PGP_ASC" >&2
	exit 1
fi

# 3. Fingerprint from the single WKD binary. There must be exactly one file
# under hu/ — multiple keys is a bug, zero means generate-wkd.sh never ran.
shopt -s nullglob
wkd_files=("$WKD_DIR"/*)
shopt -u nullglob
if [[ ${#wkd_files[@]} -ne 1 ]]; then
	printf '\033[1;31m✗ expected exactly 1 file under %s/, found %d\033[0m\n' "$WKD_DIR" "${#wkd_files[@]}" >&2
	exit 1
fi
wkd_file="${wkd_files[0]}"
wkd_fpr=$(gpg --show-keys --with-colons "$wkd_file" 2>/dev/null \
	| awk -F: '$1=="pub"{seen=1} seen && $1=="fpr"{print $10; exit}')
if [[ -z "$wkd_fpr" ]]; then
	printf '\033[1;31m✗ could not parse fingerprint from WKD binary %s\033[0m\n' "$wkd_file" >&2
	exit 1
fi

if [[ "$ts_fpr" != "$asc_fpr" ]]; then
	printf '\033[1;31m✗ fingerprint mismatch: %s says %s, but %s holds %s\033[0m\n' \
		"$PGP_TS" "$ts_fpr" "$PGP_ASC" "$asc_fpr" >&2
	exit 1
fi
if [[ "$asc_fpr" != "$wkd_fpr" ]]; then
	printf '\033[1;31m✗ WKD binary fingerprint does not match %s — re-run scripts/generate-wkd.sh\033[0m\n' "$PGP_ASC" >&2
	printf '\033[1;31m  pgp.asc: %s\033[0m\n' "$asc_fpr" >&2
	printf '\033[1;31m  WKD:     %s\033[0m\n' "$wkd_fpr" >&2
	exit 1
fi

printf '\033[1;32m✓ pgp.ts, pgp.asc, and WKD binary all agree on %s\033[0m\n' "$asc_fpr"
