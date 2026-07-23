#!/usr/bin/env bash
#
# Assert public/files/resume.md is byte-identical to the career-mgmt
# resume draft (#837). The served file is a manual copy of that draft
# and has silently drifted before (#836 caught it weeks late). This is
# ci-local-only, opt-in via MMS_VERIFY_RESUME_SYNC=true, because CI
# runners don't carry the career-mgmt checkout.
#
# Checkout location: MMS_CAREER_MGMT_DIR, defaulting to the sibling
# checkout next to this repo. With the opt-in set, a missing checkout or
# an ambiguous draft glob is a loud failure, not a silent pass.
#
# Deliberately NOT asserted: profile.ts `summary` vs the resume's
# Professional Summary — the two are different registers by design (the
# resume's is longer and tool-specific), so a byte-compare would always
# fail and a fuzzy compare would rot. The employer/tenure cross-check
# already lives in assert-incident-employers.mjs.
set -euo pipefail

cd "$(dirname "$0")/.."

SERVED=public/files/resume.md
CHECKOUT="${MMS_CAREER_MGMT_DIR:-$(cd .. && pwd)/career-mgmt}"

if [[ ! -d "$CHECKOUT" ]]; then
	echo "✗ career-mgmt checkout not found at $CHECKOUT (set MMS_CAREER_MGMT_DIR)" >&2
	exit 1
fi

drafts=("$CHECKOUT"/*Resume*draft*.md)
if [[ ! -e "${drafts[0]}" ]]; then
	echo "✗ no *Resume*draft*.md found at the top level of $CHECKOUT" >&2
	exit 1
fi
if ((${#drafts[@]} > 1)); then
	echo "✗ multiple resume drafts in $CHECKOUT — can't pick the canonical one:" >&2
	printf '  %s\n' "${drafts[@]}" >&2
	exit 1
fi
DRAFT="${drafts[0]}"

if ! diff -u "$DRAFT" "$SERVED"; then
	echo "✗ $SERVED has drifted from $DRAFT — re-copy the draft (or update it) so the served resume stays current" >&2
	exit 1
fi

echo "✓ $SERVED is byte-identical to $(basename "$DRAFT")"
