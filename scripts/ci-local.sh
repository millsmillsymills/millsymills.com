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

section "node: build"
npm run build
ok "npm run build"

section "node: assert no URL leakage in rehearsal build"
./scripts/assert-no-url-leakage.sh
ok "no URL leakage"

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
rm -rf infra/.terraform
ok "tf.sh refuses invalid stack + missing init + wrong-stack marker"

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
