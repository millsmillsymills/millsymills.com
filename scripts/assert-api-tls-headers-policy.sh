#!/usr/bin/env bash
#
# Assert the /api/tls/* ordered_cache_behavior in CloudFront has
# response_headers_policy_id attached.
#
# Why this matters:
#   - PR #336 (closes #331) restored the attachment after a refactor
#     silently dropped it. Without the attachment, /api/tls/inspect
#     served no HSTS / CSP / COOP / COEP / CORP / X-Content-Type-Options /
#     Referrer-Policy / Permissions-Policy — every promise on the
#     /security/ page held for the static site but failed on the API
#     path.
#   - The fix is a one-line attribute addition. Deleting that line
#     passes `terraform validate`, passes every existing assert-*.sh
#     (which check the policy's *contents*, not its *attachment*), and
#     would silently reproduce #331. This lint is the dedicated guard.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

CF_TF=infra/cloudfront.tf

if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Walk every `ordered_cache_behavior { ... }` block in cloudfront.tf,
# tracking brace depth so a future nested block (none today) can't trick
# the matcher into closing early. For the block whose path_pattern is
# "/api/tls/*", confirm response_headers_policy_id is set before the
# block's closing brace.
#
# Exit codes:
#   0 — block found, attribute present
#   1 — block found, attribute missing (the regression we're guarding)
#   2 — block not found at all (refuse-blind: data shape changed)
rc=0
awk '
	/^[[:space:]]*ordered_cache_behavior[[:space:]]*\{/ {
		in_block = 1
		depth = 1
		is_tls = 0
		saw_policy = 0
		next
	}
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
	printf '     block, set `response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id`.\n' >&2
	printf '     See PR #336 / issue #331: without this, /api/tls/inspect serves no HSTS / CSP /\n' >&2
	printf '     COOP / COEP / CORP / X-Content-Type-Options / Referrer-Policy / Permissions-Policy.\n' >&2
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
