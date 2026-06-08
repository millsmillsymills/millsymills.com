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

# Pull EVERY Permissions-Policy items block's value out of cloudfront.tf.
# Multiple items blocks can exist when multiple response-headers policies
# coexist (today: aws_cloudfront_response_headers_policy.site for documents
# and aws_cloudfront_response_headers_policy.api for /api/tls/* JSON). Each
# block's value must independently meet the count floor and value shape;
# otherwise a future PR could weaken one policy's PP without the other,
# silently turning the strict-deny claim into a half-truth. Block-scoped
# so a `value = "..."` line from a neighbouring header doesn't bleed in.
policy_values=$(awk '
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
		if (is_pp && val != "") { print val }
		in_block = 0
	}
' "$CF_TF")

if [ -z "$policy_values" ]; then
	printf '\nFix: add a custom_headers_config items block in %s with header = "Permissions-Policy".\n' "$CF_TF" >&2
	printf '     See the existing Cross-Origin-* items for the shape.\n' >&2
	lint::fatal "Permissions-Policy header missing from CloudFront response-headers policy"
fi

# Inspector grades A at >=5 directives; the strict-deny posture allows only
# `()` (full deny) or `(self)` (self-allow). Validate each Permissions-Policy
# value found, so adding a second response-headers policy with weaker PP
# fails CI loudly (rather than passing because the first policy still meets
# the floor).
MIN_DIRECTIVES=5
policy_index=0
total_directive_count=0

# IFS=$'\n' iteration is bash-3.2 friendly without process substitution.
OLDIFS=$IFS
IFS=$'\n'
# shellcheck disable=SC2086  # intentional word-splitting on newlines
set -- $policy_values
IFS=$OLDIFS

for policy_value in "$@"; do
	policy_index=$((policy_index + 1))

	directive_count=$(printf '%s' "$policy_value" | awk -F',' '{ print NF }')
	if [ "$directive_count" -lt "$MIN_DIRECTIVES" ]; then
		printf '\nFix: extend Permissions-Policy #%d in %s (currently %d directives, need >=%d).\n' \
			"$policy_index" "$CF_TF" "$directive_count" "$MIN_DIRECTIVES" >&2
		printf '     /security/ promises a strict-deny baseline across every response class.\n' >&2
		lint::fatal "Permissions-Policy #$policy_index too narrow: $directive_count directives"
	fi

	violations=$(printf '%s' "$policy_value" | awk -F',' '
		{
			for (i = 1; i <= NF; i++) {
				d = $i
				gsub(/^[[:space:]]+|[[:space:]]+$/, "", d)
				if (d == "") continue
				if (d !~ /^[a-z-]+=\(\)$/ && d !~ /^[a-z-]+=\(self\)$/) print d
			}
		}
	')

	if [ -n "$violations" ]; then
		printf '\nFix: every Permissions-Policy directive in %s (policy #%d) must use `()` (deny) or `(self)` (self-allow).\n' "$CF_TF" "$policy_index" >&2
		printf '     Permissive forms (=*, =(*), explicit origins) break the strict-deny posture.\n' >&2
		printf '     Offending directive(s):\n' >&2
		printf '       %s\n' $violations >&2
		lint::fatal "Permissions-Policy #$policy_index widens beyond strict-deny"
	fi

	total_directive_count=$((total_directive_count + directive_count))
done

# Parity across policies (#694). The strict-deny baseline string is
# duplicated verbatim across every response-headers policy (site, api,
# csp_report, passkey_api, …) because this lint validates each literal
# in-file (CI has no AWS creds to read live headers) — a `locals`
# reference would be invisible to the awk above and silently disable the
# per-policy floor. The cost of that duplication is drift: an edit to one
# policy's directive list that misses the others. The floor check above
# would still pass. So require every policy's Permissions-Policy to be the
# SAME baseline, normalizing per-policy self-allows (`=(self)` -> `=()`)
# first — e.g. passkey_demo flips `publickey-credentials-*` to `(self)`,
# which is legitimate and must not trip parity. After normalization every
# value must be byte-identical; a divergent directive list fails CI.
canonical=""
parity_index=0
for policy_value in "$@"; do
	parity_index=$((parity_index + 1))
	normalized=$(printf '%s' "$policy_value" | sed 's/=(self)/=()/g')
	if [ -z "$canonical" ]; then
		canonical=$normalized
	elif [ "$normalized" != "$canonical" ]; then
		printf '\nFix: Permissions-Policy #%d in %s diverged from the shared strict-deny baseline.\n' "$parity_index" "$CF_TF" >&2
		printf '     Every response-headers policy must ship the identical directive list;\n' >&2
		printf '     only the deny/self-allow form (`=()` vs `=(self)`) may differ per policy.\n' >&2
		printf '     Update all policies together, or the /security/ strict-deny claim drifts.\n' >&2
		lint::fatal "Permissions-Policy #$parity_index drifted from baseline (#694 parity)"
	fi
done

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

lint::ok "Permissions-Policy wired in $CF_TF ($policy_index polic$([ "$policy_index" -eq 1 ] && printf 'y' || printf 'ies'), $total_directive_count directives total, baseline parity holds) + shipped in $DATA_FILE"
