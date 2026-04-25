#!/usr/bin/env bash
#
# Assert the sources of truth for mills's published keys all agree:
#   1. PGP fingerprint declared in src/data/pgp.ts
#   2. PGP armored key at public/pgp.asc
#   3. PGP WKD binary at public/.well-known/openpgpkey/hu/<zbase32>
#   4. age recipient declared in src/data/pgp.ts
#   5. age recipient at public/age.pub
#
# Drift between any two means a key rotation was botched: e.g. pgp.asc was
# regenerated without re-running scripts/generate-wkd.sh, so WKD lookups
# return a stale key. Catches the failure at PR time instead of in
# production after a rotation.
#
# The age key surface ships dormant — both pgp.ts's `age` and public/age.pub
# absent — and the check passes that case. Once mills activates the surface,
# both must be present and match.
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

# 4 + 5. age key — ships dormant. Once mills activates, both pgp.ts's
# `age` field and public/age.pub must be set and match each other.
AGE_PUB="public/age.pub"
age_set_in_ts=true
if grep -qE '^[[:space:]]*age:[[:space:]]*undefined' "$PGP_TS"; then
	age_set_in_ts=false
fi
age_file_exists=false
if [[ -f "$AGE_PUB" ]]; then
	age_file_exists=true
fi

if [[ "$age_set_in_ts" = false && "$age_file_exists" = false ]]; then
	printf '\033[1;33m·\033[0m age key dormant (pgp.ts age=undefined, %s absent) — OK\n' "$AGE_PUB"
elif [[ "$age_set_in_ts" = true && "$age_file_exists" = true ]]; then
	age_pub=$(tr -d '[:space:]' < "$AGE_PUB")
	if [[ ! "$age_pub" =~ ^age1[a-z0-9]+$ ]]; then
		printf '\033[1;31m✗ %s does not look like an age recipient (expected ^age1[a-z0-9]+$)\033[0m\n' "$AGE_PUB" >&2
		printf '\033[1;31m  hint: did you accidentally drop the private key (AGE-SECRET-KEY-...) instead of the recipient?\033[0m\n' >&2
		exit 1
	fi
	ts_age=$(grep -oE "recipient:[[:space:]]*'[^']+'" "$PGP_TS" | sed -E "s/.*'([^']+)'.*/\1/" | head -1)
	if [[ -z "$ts_age" ]]; then
		printf '\033[1;31m✗ %s has age set but no recipient string parsed — pgp.ts shape unexpected\033[0m\n' "$PGP_TS" >&2
		exit 1
	fi
	if [[ "$ts_age" != "$age_pub" ]]; then
		printf '\033[1;31m✗ %s age recipient does not match %s\033[0m\n' "$PGP_TS" "$AGE_PUB" >&2
		printf '\033[1;31m  pgp.ts:  %s\033[0m\n' "$ts_age" >&2
		printf '\033[1;31m  age.pub: %s\033[0m\n' "$age_pub" >&2
		exit 1
	fi
	printf '\033[1;32m✓ pgp.ts age recipient matches %s\033[0m\n' "$AGE_PUB"
elif [[ "$age_set_in_ts" = true ]]; then
	printf '\033[1;31m✗ pgp.ts has age set but %s is missing — drop the recipient there\033[0m\n' "$AGE_PUB" >&2
	exit 1
else
	printf '\033[1;31m✗ %s exists but pgp.ts age is undefined — set pgp.age in src/data/pgp.ts\033[0m\n' "$AGE_PUB" >&2
	exit 1
fi
