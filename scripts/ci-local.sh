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

section "node: assert incident employers match profile.ts experience tenures"
node scripts/assert-incident-employers.mjs
ok "incidents.ts employer + year matches profile.ts; resume.md matches profile.ts"

section "node: assert security-controls.ts code paths resolve"
./scripts/assert-security-controls-paths.sh
ok "every cited code path on /security/ exists in the repo"

section "node: assert COOP / COEP / CORP headers wired"
./scripts/assert-coop-coep-corp.sh
ok "cross-origin isolation headers shipping with promised values"

section "node: assert Permissions-Policy header wired"
./scripts/assert-permissions-policy.sh
ok "Permissions-Policy strict-deny baseline shipping"

section "node: assert /api/tls/* response-headers policy attached"
./scripts/assert-api-tls-headers-policy.sh
ok "/api/tls/* ordered_cache_behavior has response_headers_policy_id"

section "node: assert SLSA generator pin moves off Node 20 before deadline"
./scripts/assert-slsa-pin-fresh.sh
ok "slsa-github-generator pin tracked against 2026-06-02 deadline"

section "node: vitest"
npm run test
ok "npm run test"

section "node: build"
npm run build
ok "npm run build"

section "node: assert flag-unlock inline-script CSP hash in sync"
./scripts/assert-flags-init-csp.sh
ok "DesktopLayout inline flag-unlock script hash pinned in cloudfront.tf"

section "node: playwright e2e"
# Install the chromium binary if the local cache is empty (idempotent — a
# warm cache makes this a no-op). `--with-deps` is skipped locally because
# it sudo-installs system packages; CI uses --with-deps.
if [ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}" ] \
	&& [ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" ]; then
	npx playwright install chromium
fi
npm run test:e2e
ok "playwright e2e"

section "node: assert fonts present + no Google Fonts leakage"
./scripts/assert-fonts-csp.sh
ok "fonts ship + CSP font-src 'self' is honest"

section "node: assert og:image per-app gate"
node scripts/assert-og-image-per-app.mjs
ok "og:image presence in dist/ tracks apps.ts hidden flag"

section "node: assert SRI on every cross-origin asset"
node scripts/assert-sri-on-cross-origin-assets.mjs
ok "no cross-origin asset shipped without integrity + crossorigin"

section "node: assert llms.txt enumerates every app + well-known path"
./scripts/assert-llms-txt-completeness.sh
ok "dist/llms.txt covers apps.ts + well-known paths + PGP fingerprint"

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
if ./scripts/tf.sh millsymills plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch missing init\033[0m\n' >&2
	exit 1
fi
# Wrong-stack marker must exit 4.
mkdir -p infra/.terraform
printf 'stale-stack\n' > infra/.terraform/.stack
if ./scripts/tf.sh millsymills plan >/dev/null 2>&1; then
	printf '\033[1;31m✗ tf.sh did not catch wrong-stack marker\033[0m\n' >&2
	exit 1
fi
# force-unlock targets remote state too; must be guarded same as plan/apply.
# Assert on stderr containing "refusing:" — non-zero exit alone would also
# fire if terraform reached the backend and failed for a different reason
# (no such lock id), masking a real guard regression. Capture stderr into a
# variable rather than piping so `pipefail` doesn't conflate tf.sh's expected
# nonzero exit (4) with a pipeline failure.
unlock_stderr=$(./scripts/tf.sh millsymills force-unlock fake-id 2>&1 1>/dev/null || true)
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

section "python: ct_monitor unit tests"
# Lambda code is stdlib + boto3 only and isn't deployed via this CI,
# but the SNS body interpolates untrusted crt.sh fields so the
# sanitizer + issuer allow-list need test coverage.
python3 -m unittest discover -s infra/tests -t .
ok "infra/ct_monitor.py unit tests"

section "node: webauthn_demo lambda unit tests"
# Lambda for the /demo/passkey backend (issue #140). Stdlib `node:test`
# runner; the handler stubs out DynamoDB so no AWS calls happen. devDeps
# (the @aws-sdk/* packages bundled at runtime by Lambda) are installed
# locally for the import to resolve.
(cd infra/lambdas/webauthn_demo && npm ci >/dev/null 2>&1)
node --test 'infra/lambdas/webauthn_demo/tests/**/*.test.mjs'
ok "infra/lambdas/webauthn_demo unit tests"

section "terraform: fmt"
terraform -chdir=infra fmt -check -recursive
ok "terraform fmt"

section "terraform: init (no backend)"
terraform -chdir=infra init -backend=false -input=false -reconfigure
ok "terraform init"

section "terraform: validate"
terraform -chdir=infra validate
ok "terraform validate"

# `infra/bootstrap-state/` is a separate Terraform root (its own
# backend, its own provider config) -- the `-chdir=infra` validate
# above does not descend into it. Validate explicitly so a syntax
# error in the bootstrap module (e.g. a bad `import { ... }` block)
# fails CI rather than only surfacing at manual `terraform plan` time.
section "terraform: bootstrap-state init + validate"
terraform -chdir=infra/bootstrap-state init -backend=false -input=false -reconfigure
terraform -chdir=infra/bootstrap-state validate
ok "terraform validate (bootstrap-state)"

section "scripts: analytics shellcheck + shfmt + SQL lint"
if ! command -v shellcheck >/dev/null 2>&1; then
	printf '\033[1;31m✗ shellcheck not on PATH; install with `brew install shellcheck`\033[0m\n' >&2
	exit 1
fi
if ! command -v shfmt >/dev/null 2>&1; then
	printf '\033[1;31m✗ shfmt not on PATH; install with `brew install shfmt`\033[0m\n' >&2
	exit 1
fi
# Hard-require duckdb here so the SQL parse-check actually runs in this CI
# context — lint-queries.sh silently skips when duckdb is absent (so a dev
# running it ad-hoc isn't blocked), and that silent-skip is the wrong posture
# for the gate. Matches the shellcheck/shfmt fail-loud posture above.
if ! command -v duckdb >/dev/null 2>&1; then
	printf '\033[1;31m✗ duckdb not on PATH; install with `brew install duckdb`\033[0m\n' >&2
	exit 1
fi
shellcheck scripts/analytics/run.sh scripts/analytics/lint-queries.sh
# -ci: switch-case patterns indent inside `case ... esac`, matching the rest
# of scripts/ (e.g. tf.sh).
shfmt -ci -d scripts/analytics/run.sh scripts/analytics/lint-queries.sh
./scripts/analytics/lint-queries.sh
ok "analytics: shellcheck + shfmt + SQL parse-check clean"

section "actions: zizmor"
# Static analysis on workflow files. Two SLSA reusable-workflow `uses:`
# refs carry inline `# zizmor: ignore[unpinned-uses]` -- SLSA's L3
# trust model authenticates the published `vX.Y.Z` tag itself, so the
# tag-pin there is deliberate.
if ! command -v zizmor >/dev/null 2>&1; then
	printf '\033[1;31m✗ zizmor not on PATH; install with `brew install zizmor` (macOS) or `cargo install zizmor`\033[0m\n' >&2
	exit 1
fi
zizmor --min-severity medium .github/workflows/
ok "zizmor (medium+) clean"

section "post-deploy: inspector_tls Function URL 403 (opt-in)"
# Off by default — requires AWS creds + a deployed stack. Set
# MMS_SMOKE_STACK=<stack> (e.g. millsymills) to run after `tf.sh apply`. The
# OAC + IAM-auth combo on the inspector_tls Lambda Function URL is the
# load-bearing protection for /api/tls/* (issue #354 / PR #343); the
# script asserts the raw URL still returns 403 to unsigned requests.
if [[ -n "${MMS_SMOKE_STACK:-}" ]]; then
	./scripts/smoke-inspector-tls.sh "$MMS_SMOKE_STACK"
	ok "inspector_tls Function URL returns 403 for $MMS_SMOKE_STACK"
else
	printf '\033[2mskipped (set MMS_SMOKE_STACK=<stack> to run)\033[0m\n'
fi

section "post-deploy: csp_report Function URL 403 (opt-in)"
# Same shape as the inspector_tls smoke. Asserts the OAC + IAM-auth
# boundary on /api/csp-report (issue #369 followup to PR #355).
if [[ -n "${MMS_SMOKE_STACK:-}" ]]; then
	./scripts/smoke-csp-report.sh "$MMS_SMOKE_STACK"
	ok "csp_report Function URL returns 403 for $MMS_SMOKE_STACK"
else
	printf '\033[2mskipped (set MMS_SMOKE_STACK=<stack> to run)\033[0m\n'
fi

section "audit: terraform state bucket controls (opt-in)"
# Off by default — requires AWS creds. Set MMS_VERIFY_STATE_BUCKET=true
# to run. Asserts the live `millsymills-terraform-state` bucket matches
# the controls codified in `infra/bootstrap-state/main.tf`
# (versioning, SSE, public-access-block, ownership, TLS-only policy,
# noncurrent-version lifecycle). Closes the verification half of #283.
if [[ "${MMS_VERIFY_STATE_BUCKET:-}" == "true" ]]; then
	./scripts/verify-state-bucket.sh
	ok "state bucket controls match infra/bootstrap-state/"
else
	printf '\033[2mskipped (set MMS_VERIFY_STATE_BUCKET=true to run)\033[0m\n'
fi

section "done"
ok "all CI checks passed locally"
