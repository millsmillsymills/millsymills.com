#!/usr/bin/env bash
#
# Replicate .github/workflows/ci.yml locally. Run from the repo root.
#
# Useful when GitHub Actions minutes are exhausted, when iterating on
# a branch before opening a PR, or when the CI runners are flaky.
# Exits non-zero on the first failure, same as CI.

set -euo pipefail

# Always operate relative to the repo root regardless of cwd.
cd "$(git rev-parse --show-toplevel)"

section() {
	printf '\n\033[1;36m== %s ==\033[0m\n' "$1"
}

ok() {
	printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

section "node: npm ci"
npm ci
ok "npm ci"

section "node: assert icon assets referenced by apps.ts exist"
./scripts/assert-icon-assets-exist.sh
ok "all iconUrl values resolve"

section "node: assert PGP fingerprint + WKD binary consistency"
./scripts/assert-pgp-consistency.sh
ok "pgp.ts, pgp.asc, and WKD binary agree"

section "node: build"
npm run build
ok "npm run build"

section "node: assert no URL leakage in rehearsal build"
./scripts/assert-no-url-leakage.sh
ok "no URL leakage (rehearsal direction)"

section "node: assert no rehearsal URL leakage in prod build"
./scripts/assert-no-rehearsal-leakage.sh
ok "no URL leakage (prod direction)"

section "node: astro check"
# Prefer the `check` script if defined; otherwise fall back to npx.
if node -e "process.exit(require('./package.json').scripts.check ? 0 : 1)" 2>/dev/null; then
	npm run check
else
	npx astro check
fi
ok "astro check"

section "scripts: tf.sh refusal checks"
# Invalid stack name must exit 2.
if ./scripts/tf.sh definitely-not-a-stack plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh accepted an invalid stack name\033[0m\n' >&2
	exit 1
fi
# Missing marker (no init yet) must exit 3.
rm -rf infra/.terraform
if ./scripts/tf.sh p41m0n plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch missing init\033[0m\n' >&2
	exit 1
fi
# Wrong-stack marker must exit 4.
mkdir -p infra/.terraform
printf 'millsymills\n' > infra/.terraform/.stack
if ./scripts/tf.sh p41m0n plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch wrong-stack marker\033[0m\n' >&2
	exit 1
fi
# force-unlock targets remote state too; must be guarded same as plan/apply.
# Assert on stderr containing "refusing:" — non-zero exit alone would also
# fire if terraform reached the backend and failed for a different reason
# (no such lock id), masking a real guard regression.
if ! ./scripts/tf.sh p41m0n force-unlock fake-id 2>&1 1>/dev/null | grep -q 'refusing:'; then
	printf '\033[1;31m✗ tf.sh did not guard force-unlock against wrong stack\033[0m\n' >&2
	exit 1
fi
rm -rf infra/.terraform
ok "tf.sh refuses invalid stack + missing init + wrong-stack marker + wrong-stack force-unlock"

section "infra: per-stack deploy_workflow files exist"
# Each stacks/<name>.tfvars sets deploy_workflow to a filename under
# .github/workflows/. A typo would only surface at terraform-apply time
# (and then OIDC trust would be wrong). Catch it locally.
for tfv in infra/stacks/*.tfvars; do
	stack=$(basename "$tfv" .tfvars)
	wf=$(grep -E '^deploy_workflow' "$tfv" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
	wf=${wf:-deploy.yml}
	if [ ! -f ".github/workflows/$wf" ]; then
		printf '\033[1;31m✗ stack %s references missing workflow .github/workflows/%s\033[0m\n' "$stack" "$wf" >&2
		exit 1
	fi
done
ok "stacks/*.tfvars deploy_workflow files all exist"

section "terraform: fmt"
terraform -chdir=infra fmt -check -recursive
ok "terraform fmt"

section "terraform: init (no backend)"
terraform -chdir=infra init -backend=false -input=false -reconfigure
ok "terraform init"

section "terraform: validate"
terraform -chdir=infra validate
ok "terraform validate"

section "done"
ok "all CI checks passed locally"
