#!/usr/bin/env bash
#
# Assert the cross-origin isolation triple (COOP / COEP / CORP) is
# wired into the CloudFront response-headers policy with the values
# the /security/ page promises:
#
#   Cross-Origin-Opener-Policy:   same-origin
#   Cross-Origin-Embedder-Policy: require-corp
#   Cross-Origin-Resource-Policy: same-origin
#
# Why this matters:
#   - COEP `require-corp` is the strict variant. If a future change
#     accidentally weakens it to `unsafe-none` or `credentialless`,
#     the cross-origin isolation guarantee silently regresses. The
#     /security/ page would then make a claim the response headers
#     contradict — exactly the drift this lint catches.
#   - The values are checked against `infra/cloudfront.tf` directly,
#     not against a CloudFront live response. CI doesn't have AWS
#     creds, and we want the lint to fail at PR time, not after
#     deploy. `terraform validate` already runs in ci-local.sh, so
#     a syntactically wrong custom_headers_config block fails there;
#     this lint catches semantic drift on top of that.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

CF_TF=infra/cloudfront.tf

if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Each row: header name + required value. Tab-separated to keep the
# table readable while staying bash-3.2 friendly (no associative arrays).
HEADERS=$(printf '%s\n' \
	"Cross-Origin-Opener-Policy	same-origin" \
	"Cross-Origin-Embedder-Policy	require-corp" \
	"Cross-Origin-Resource-Policy	same-origin")

missing=0
while IFS=$'\t' read -r header value; do
	# Match an `items { ... }` block in custom_headers_config where the
	# `header = "<name>"` and `value = "<expected>"` lines co-occur
	# anywhere within the same block. Anchoring on `items {` (rather than
	# on the header line) makes the matcher order-independent — a future
	# `terraform fmt` change that swaps the field order would otherwise
	# silently invert this assert from passing to failing on a correct
	# config. Per-block scoping prevents a `header = "X"` in one block
	# matching a `value = "Y"` in a different block.
	#
	# Known gap (acknowledged): if a buggy refactor adds a second items
	# block for the same header with a weakened value alongside the
	# original, this loop still passes because some block matches. The
	# threat model is a clobbering refactor, not an attacker; the
	# `terraform plan` diff and manual response inspection are the
	# downstream guards. Catching duplicate items blocks is left out
	# of scope to keep this lint legible.
	if ! awk -v h="$header" -v v="$value" '
		/items[[:space:]]*\{/ { in_block = 1; saw_header = 0; saw_value = 0; next }
		in_block && $0 ~ "header[[:space:]]*=[[:space:]]*\"" h "\"" { saw_header = 1 }
		in_block && $0 ~ "value[[:space:]]*=[[:space:]]*\"" v "\"" { saw_value = 1 }
		in_block && /\}/ {
			if (saw_header && saw_value) { found = 1 }
			in_block = 0
		}
		END { exit found ? 0 : 1 }
	' "$CF_TF"; then
		lint::fail "missing or wrong: $header: $value"
		missing=1
	fi
done <<EOF
$HEADERS
EOF

if [ "$missing" -ne 0 ]; then
	printf '\nFix: edit %s so the custom_headers_config items block sets each header to the value above.\n' "$CF_TF" >&2
	printf '     The /security/ page (`coop-coep` entry in src/data/security-controls.ts) cites these exact values.\n' >&2
	lint::fatal "cross-origin isolation headers drift"
fi

# Belt + suspenders: ensure the security-controls entry is still
# `shipped` (not silently flipped back to `roadmap` by a refactor).
DATA_FILE=src/data/security-controls.ts
if [ ! -s "$DATA_FILE" ]; then
	lint::refuse_blind "$DATA_FILE missing or empty"
fi

if ! awk '
	/id:[[:space:]]*[\x27"]coop-coep[\x27"]/ { in_block = 1 }
	in_block && /status:[[:space:]]*[\x27"]shipped[\x27"]/ { found = 1 }
	in_block && /^\t\},?$/ { in_block = 0 }
	END { exit found ? 0 : 1 }
' "$DATA_FILE"; then
	lint::fatal "$DATA_FILE: coop-coep entry is not status: 'shipped'"
fi

lint::ok "COOP / COEP / CORP wired in $CF_TF + shipped in $DATA_FILE"
