#!/usr/bin/env bash
#
# Assert every scripts/assert-* invocation in scripts/ci-local.sh also
# appears as a step in .github/workflows/ci.yml. ci.yml's header claims
# lockstep with ci-local.sh (#332) but nothing enforced it — one assert
# script ran only locally for ~5 weeks while PR CI stayed green (#839).
#
# Wired into BOTH ci-local.sh and ci.yml, so it guards itself: removing
# it (or any other assert) from ci.yml fails the local run, and vice
# versa a new local-only assert fails CI's copy of this check.
#
# Legitimately local-only asserts (anything gated behind an MMS_* env
# opt-in in ci-local.sh) belong in the helper's ALLOWLIST with a one-line
# comment per exemption.
set -euo pipefail

cd "$(dirname "$0")/.."

exec node scripts/lib/check-ci-assert-parity.mjs
