#!/usr/bin/env bash
#
# Assert the Permissions-Policy header is wired into the CloudFront
# response-headers policy and matches what the /security/ page promises.
#
# Why this matters:
#   - Permissions-Policy is the deny-by-default surface for powerful web
#     features (camera, mic, USB/serial/HID, geolocation, payment, …).
#     The site calls zero of these APIs today; a weakened or removed
#     policy makes the /security/ page's "powerful features denied"
#     claim a silent lie.
#   - We don't pin every directive — that would force this lint to
#     update whenever a future feature legitimately needs a permission
#     (e.g. WebAuthn demo #140 flipping `publickey-credentials-get` from
#     `=()` to `=(self)`). Instead we floor on the Inspector's grade-A
#     threshold: at least 5 directives. Below that the /security/ page
#     and the inspector both stop being honest.
#   - Values are checked against `infra/cloudfront.tf` directly, not a
#     live CloudFront response. CI has no AWS creds and we want PR-time
#     failures, not post-deploy ones.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

CF_TF=infra/cloudfront.tf

if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Pull the Permissions-Policy value out of the items block whose header
# is "Permissions-Policy". Block-scoped so we don't accidentally pick up
# a `value = "..."` line from a neighbouring header. Mirrors the matcher
# style used by assert-coop-coep-corp.sh.
policy_value=$(awk '
	/items[[:space:]]*\{/ { in_block = 1; is_pp = 0; val = ""; next }
	in_block && $0 ~ /header[[:space:]]*=[[:space:]]*"Permissions-Policy"/ { is_pp = 1 }
	in_block && $0 ~ /value[[:space:]]*=[[:space:]]*"/ {
		# Strip up through the opening quote of the value, then drop the
		# trailing closing quote. Works on the single-line value form
		# emitted by `terraform fmt`.
		line = $0
		sub(/^[^"]*"/, "", line)
		sub(/"[[:space:]]*$/, "", line)
		val = line
	}
	in_block && /\}/ {
		if (is_pp && val != "") { print val; exit 0 }
		in_block = 0
	}
' "$CF_TF")

if [ -z "$policy_value" ]; then
	printf '\nFix: add a custom_headers_config items block in %s with header = "Permissions-Policy".\n' "$CF_TF" >&2
	printf '     See the existing Cross-Origin-* items for the shape.\n' >&2
	lint::fatal "Permissions-Policy header missing from CloudFront response-headers policy"
fi

# Count comma-separated directives. The Inspector grades A at >=5; we
# ship 28 today. Floor the lint at 5 so a refactor that strips the
# policy back to 1-2 directives fails CI loudly.
directive_count=$(printf '%s' "$policy_value" | awk -F',' '{ print NF }')
MIN_DIRECTIVES=5

if [ "$directive_count" -lt "$MIN_DIRECTIVES" ]; then
	printf '\nFix: extend the Permissions-Policy value in %s.\n' "$CF_TF" >&2
	printf '     /security/ promises a strict-deny baseline; <%d directives undermines that claim.\n' "$MIN_DIRECTIVES" >&2
	lint::fatal "Permissions-Policy too narrow: $directive_count directives (need >=$MIN_DIRECTIVES)"
fi

# Belt + suspenders: ensure the security-controls entry is still shipped.
DATA_FILE=src/data/security-controls.ts
if [ ! -s "$DATA_FILE" ]; then
	lint::refuse_blind "$DATA_FILE missing or empty"
fi

# `\x27` for a literal single-quote is gawk-only; pass the quote
# character in via -v so the regex stays portable across BSD awk (macOS)
# and gawk/mawk (Linux). Mirrors assert-coop-coep-corp.sh.
if ! awk -v q="'" '
	$0 ~ ("id:[[:space:]]*[" q "\"]permissions-policy[" q "\"]") { in_block = 1 }
	in_block && $0 ~ ("status:[[:space:]]*[" q "\"]shipped[" q "\"]") { found = 1 }
	in_block && /^\t\},?$/ { in_block = 0 }
	END { exit found ? 0 : 1 }
' "$DATA_FILE"; then
	lint::fatal "$DATA_FILE: permissions-policy entry is not status: 'shipped'"
fi

lint::ok "Permissions-Policy wired in $CF_TF ($directive_count directives) + shipped in $DATA_FILE"
