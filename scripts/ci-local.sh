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

section "node: assert browserStorage keys documented in privacy-copy"
node scripts/assert-privacy-storage-keys.mjs
ok "privacy-copy.ts matches src/scripts/ storage usage"

section "node: assert security-controls.ts code paths resolve"
./scripts/assert-security-controls-paths.sh
ok "every cited code path on /security/ exists in the repo"

section "node: assert COOP / COEP / CORP headers wired"
./scripts/assert-coop-coep-corp.sh
ok "cross-origin isolation headers shipping with promised values"

section "node: build"
npm run build
ok "npm run build"

section "node: assert fonts present + no Google Fonts leakage"
./scripts/assert-fonts-csp.sh
ok "fonts ship + CSP font-src 'self' is honest"

section "node: assert llms.txt enumerates every app + well-known path"
./scripts/assert-llms-txt-completeness.sh
ok "dist/llms.txt covers apps.ts + well-known paths + PGP fingerprint"

section "node: assert no URL leakage in rehearsal build"
./scripts/assert-no-url-leakage.sh
ok "no URL leakage (rehearsal direction)"

section "node: assert no rehearsal URL leakage in prod build"
./scripts/assert-no-rehearsal-leakage.sh
ok "no URL leakage (prod direction)"

section "node: astro check"
# Set CI=true so astro.config.mjs's CI guard is exercised locally — without
# this, the local run silently bypasses the SITE_URL assertion that fires in
# real GitHub Actions. SITE_URL is required by that same guard.
export CI=true
export SITE_URL="${SITE_URL:-https://millsymills.com}"
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
# (no such lock id), masking a real guard regression. Capture stderr into a
# variable rather than piping so `pipefail` doesn't conflate tf.sh's expected
# nonzero exit (4) with a pipeline failure.
unlock_stderr=$(./scripts/tf.sh p41m0n force-unlock fake-id 2>&1 1>/dev/null || true)
if ! grep -q 'refusing:' <<<"$unlock_stderr"; then
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
	# `|| true` because grep returns 1 when no `deploy_workflow` is set
	# (tfvars relies on the variable's default in that case); under
	# `pipefail` an unmatched grep would otherwise abort the loop.
	wf=$(grep -E '^deploy_workflow' "$tfv" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
	wf=${wf:-deploy.yml}
	if [ ! -f ".github/workflows/$wf" ]; then
		printf '\033[1;31m✗ stack %s references missing workflow .github/workflows/%s\033[0m\n' "$stack" "$wf" >&2
		exit 1
	fi
done
ok "stacks/*.tfvars deploy_workflow files all exist"

section "infra: per-stack deploy_environment matches workflow's environment block"
# OIDC trust policy's sub claim uses the env-form `repo:owner/name:environment:<env>`,
# so the value in stacks/<name>.tfvars MUST match the `environment: name:` field
# in the workflow file it references. A drift would surface only at deploy time
# as `Not authorized to perform sts:AssumeRoleWithWebIdentity`. Catch it locally.
for tfv in infra/stacks/*.tfvars; do
	stack=$(basename "$tfv" .tfvars)
	wf=$(grep -E '^deploy_workflow' "$tfv" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
	wf=${wf:-deploy.yml}
	tfv_env=$(grep -E '^deploy_environment' "$tfv" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
	tfv_env=${tfv_env:-production}
	# Workflow's env name appears as `name: <env>` inside the job's `environment:` block.
	wf_env=$(awk '/^[[:space:]]*environment:[[:space:]]*$/{flag=1; next} flag && /^[[:space:]]*name:/{print $2; exit}' ".github/workflows/$wf" | tr -d '"' || true)
	if [ -z "$wf_env" ]; then
		printf '\033[1;31m✗ stack %s: workflow %s has no `environment: name:` field\033[0m\n' "$stack" "$wf" >&2
		exit 1
	fi
	if [ "$tfv_env" != "$wf_env" ]; then
		printf '\033[1;31m✗ stack %s: tfvars deploy_environment=%q != workflow %s environment=%q (OIDC trust will reject)\033[0m\n' "$stack" "$tfv_env" "$wf" "$wf_env" >&2
		exit 1
	fi
done
ok "stacks/*.tfvars deploy_environment matches each workflow's environment block"

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
