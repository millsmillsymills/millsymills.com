#!/usr/bin/env bash
#
# Assert the Trusted Types policy-name allowlist in the CSP directive stays
# in sync with the `createPolicy('<name>')` call sites that actually run.
#
# Why this matters:
#   - The TT directive (`trusted-types <name> <name> ...`) lives in
#     infra/cloudfront.tf locals (html_tt_report_only today; html_csp after
#     the enforce flip, #130/#718). The names it lists are the ONLY policy
#     names the browser will let `trustedTypes.createPolicy()` construct.
#   - Under enforce, a `createPolicy('x')` whose name is absent from the
#     directive throws — turning a JS bundle into a blank shell in
#     production, invisible in local dev and green in CI.
#   - The names are hand-duplicated across the TF directive and the JS/TS
#     call sites with no structural coupling, so a rename or list edit on
#     one side ships green and fails only at runtime. This lint makes the
#     coupling enforced: every declared name must have a call site, and
#     every call site name must be declared.
#   - Checked against infra/cloudfront.tf directly, not a live header — CI
#     has no AWS creds and we want PR-time failures, not post-deploy ones.
#
# Wired into scripts/ci-local.sh.

set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/lint.sh"
lint::cd_to_repo_root

CF_TF=infra/cloudfront.tf

if [ ! -s "$CF_TF" ]; then
	lint::refuse_blind "$CF_TF missing or empty"
fi

# Names declared in the `trusted-types <names>;` directive of every locals
# string. The trailing space in `trusted-types ` is load-bearing: it stops
# the substring inside `require-trusted-types-for` (followed by `-for`, not a
# space) from matching. Comment lines are filtered first so prose mentioning
# the directive can't leak a phantom name. `'none'` / `'allow-duplicates'` /
# `*` are CSP keywords, not policy names — dropped.
declared=$(grep -vE '^[[:space:]]*#' "$CF_TF" |
	grep -oE "trusted-types [^;\"]*" |
	sed -E 's/^trusted-types //' |
	tr ' ' '\n' |
	grep -vE "^('none'|'allow-duplicates'|\*)$" |
	grep -vE '^[[:space:]]*$' |
	sort -u || true)

if [ -z "$declared" ]; then
	lint::refuse_blind "no trusted-types directive found in $CF_TF"
fi

# Names passed to createPolicy('<name>') in shipped JS/TS. The `['\"]`
# immediately after the paren is what excludes the TrustedTypePolicyFactory
# type signature in src/types/global.d.ts (`createPolicy(name: string, ...)`
# — no quote after the paren).
used=$(grep -rhoE "createPolicy\([\"'][A-Za-z0-9_-]+" \
	--include='*.js' --include='*.ts' --include='*.mjs' \
	src public |
	sed -E "s/createPolicy\([\"']//" |
	sort -u || true)

if [ -z "$used" ]; then
	lint::refuse_blind "no createPolicy('<name>') call sites found under src/ or public/"
fi

# Space-padded single-line forms for substring membership tests below.
declared_sp=" $(printf '%s' "$declared" | tr '\n' ' ') "
used_sp=" $(printf '%s' "$used" | tr '\n' ' ') "
fail=0

# Declared but never constructed: the CSP allowlists a name no bundle uses.
# Usually means a call site was renamed or removed without updating the TF
# directive — dead allowlist entry, and the live name is now unprotected.
for name in $declared; do
	case "$used_sp" in
	*" $name "*) ;;
	*)
		lint::fail "TT policy name '$name' is allowlisted in $CF_TF but no createPolicy('$name') call site exists"
		fail=1
		;;
	esac
done

# Constructed but not declared: a bundle calls createPolicy() with a name the
# CSP does not allow. Throws under enforce — the failure this lint exists for.
for name in $used; do
	case "$declared_sp" in
	*" $name "*) ;;
	*)
		lint::fail "createPolicy('$name') has no matching name in the trusted-types directive of $CF_TF"
		fail=1
		;;
	esac
done

if [ "$fail" -ne 0 ]; then
	printf '\nFix: keep the trusted-types directive in %s and the createPolicy() call sites in sync.\n' "$CF_TF" >&2
	printf '     Declared:%s\n' "$declared_sp" >&2
	printf '     Used:    %s\n' "$used_sp" >&2
	lint::fatal "Trusted Types policy-name drift between CSP directive and call sites"
fi

decl_count=$(printf '%s\n' "$declared" | grep -c .)
lint::ok "Trusted Types policy names in sync ($decl_count name(s):$declared_sp) across $CF_TF + createPolicy() call sites"
