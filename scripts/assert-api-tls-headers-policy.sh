#!/usr/bin/env bash
#
# Assert the /api/tls/* ordered_cache_behavior in CloudFront has
# response_headers_policy_id attached.
#
# Why this matters: existing assert-*.sh siblings check the policy's
# *contents* (COOP/COEP/CORP, Permissions-Policy). None check whether
# the policy is *attached* to a behavior. A refactor that drops the
# attribute on /api/tls/* would pass `terraform validate` and every
# existing CI gate, leaving the API path serving no HSTS / CSP / COOP /
# COEP / CORP / X-Content-Type-Options / Referrer-Policy /
# Permissions-Policy.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

CF_TF=infra/cloudfront.tf

if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Walk every `ordered_cache_behavior { ... }` block in cloudfront.tf —
# both the static form and the `dynamic "ordered_cache_behavior" { ... }`
# wrapper used by the toggle-gated behaviors. Brace-depth
# tracking handles either shape: the dynamic wrapper closes at the same
# depth the static block would, so its inner `content { ... }` attrs
# (path_pattern, response_headers_policy_id) are visible during the scan.
# HCL `${var}` interpolation inside attribute values (e.g.
# `target_origin_id = "lambda-${local.x}"`) is preserved by depth
# tracking; sibling asserts use a simpler `/\}/` matcher because their
# items blocks contain only literal strings.
#
# Skip lines whose first non-space character is `#` so a commented-out
# attribute can't masquerade as the live attachment.
#
# Exit codes:
#   0 — block found, attribute present
#   1 — block found, attribute missing (the regression we're guarding)
#   2 — block not found at all (refuse-blind: data shape changed)
rc=0
awk '
	/^[[:space:]]*ordered_cache_behavior[[:space:]]*\{/ ||
	/^[[:space:]]*dynamic[[:space:]]+"ordered_cache_behavior"[[:space:]]*\{/ {
		in_block = 1
		depth = 1
		is_tls = 0
		saw_policy = 0
		next
	}
	in_block && /^[[:space:]]*#/ { next }
	in_block {
		opens = gsub(/\{/, "{")
		depth += opens
		closes = gsub(/\}/, "}")
		depth -= closes

		if ($0 ~ /path_pattern[[:space:]]*=[[:space:]]*"\/api\/tls\/\*"/) {
			is_tls = 1
		}
		if ($0 ~ /response_headers_policy_id[[:space:]]*=/) {
			saw_policy = 1
		}

		if (depth <= 0) {
			if (is_tls) {
				if (saw_policy) { found = 1 }
				else { missing = 1 }
			}
			in_block = 0
		}
	}
	END {
		if (missing) { exit 1 }
		if (!found) { exit 2 }
		exit 0
	}
' "$CF_TF" || rc=$?

case "$rc" in
0) ;;
1)
	lint::fail "/api/tls/* ordered_cache_behavior is missing response_headers_policy_id"
	printf '\nFix: in %s, inside the `ordered_cache_behavior { path_pattern = "/api/tls/*" ... }`\n' "$CF_TF" >&2
	printf '     block, set `response_headers_policy_id = aws_cloudfront_response_headers_policy.<policy>.id`.\n' >&2
	printf '     Without it, /api/tls/inspect serves no HSTS / CSP / COOP / COEP / CORP /\n' >&2
	printf '     X-Content-Type-Options / Referrer-Policy / Permissions-Policy.\n' >&2
	exit 1
	;;
2)
	lint::refuse_blind "no ordered_cache_behavior with path_pattern \"/api/tls/*\" found in $CF_TF"
	;;
*)
	lint::fatal "unexpected awk exit $rc"
	;;
esac

lint::ok "/api/tls/* ordered_cache_behavior has response_headers_policy_id attached in $CF_TF"
