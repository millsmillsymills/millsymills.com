#!/usr/bin/env bash
#
# Stack-aware Terraform wrapper. Usage:
#   ./scripts/tf.sh <stack> <terraform-args...>
#
# Valid stacks: millsymills, p41m0n.
# The wrapper enforces:
#   - per-stack backend-config at init
#   - per-stack -var-file on plan/apply/destroy/refresh
#   - stale-state guard via a marker file written at init

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

STACK="${1:-}"
shift || true

case "$STACK" in
	millsymills|p41m0n) ;;
	*)
		printf '\033[1;31mrefusing: stack must be one of [millsymills, p41m0n], got %q\033[0m\n' "$STACK" >&2
		exit 2
		;;
esac

MARKER="infra/.terraform/.stack"

printf '\033[1;36m== tf.sh: stack=%s ==\033[0m\n' "$STACK"

SUBCMD="${1:-}"

init_stack() {
	terraform -chdir=infra init -reconfigure -backend-config="stacks/${STACK}.backend.hcl" -input=false "$@"
	# Record which stack this working dir is initialized for. Read by
	# stale_state_guard below. Written AFTER a successful init so a
	# failed init doesn't leave a stale marker.
	printf '%s\n' "$STACK" > "$MARKER"
}

stale_state_guard() {
	# Only run for commands that touch remote state.
	case "$SUBCMD" in
		apply|destroy|plan|refresh|import|state|output|console|show|force-unlock) ;;
		*) return 0 ;;
	esac

	if [[ ! -f "$MARKER" ]]; then
		printf '\033[1;31mrefusing: %s missing; run `./scripts/tf.sh %s init` first\033[0m\n' "$MARKER" "$STACK" >&2
		exit 3
	fi

	local current_stack
	read -r current_stack < "$MARKER"

	if [[ "$current_stack" != "$STACK" ]]; then
		printf '\033[1;31mrefusing: infra/.terraform initialized for stack %q, this command targets %q. Run `./scripts/tf.sh %s init` to re-init.\033[0m\n' "$current_stack" "$STACK" "$STACK" >&2
		exit 4
	fi
}

case "$SUBCMD" in
	init)
		init_stack "${@:2}"
		;;
	plan|apply|destroy|refresh)
		stale_state_guard
		terraform -chdir=infra "$SUBCMD" -var-file="stacks/${STACK}.tfvars" "${@:2}"
		;;
	output|state|import|console|show|force-unlock)
		# Touch remote state — guard against running against the wrong stack.
		stale_state_guard
		terraform -chdir=infra "$@"
		;;
	fmt|validate|workspace|providers|get|version)
		# No state needed, no guard.
		terraform -chdir=infra "$@"
		;;
	"")
		printf 'usage: ./scripts/tf.sh <stack> <terraform-subcommand> [args...]\n' >&2
		exit 2
		;;
	*)
		printf '\033[1;33mwarning: passing unknown subcommand %q through without guard\033[0m\n' "$SUBCMD" >&2
		terraform -chdir=infra "$@"
		;;
esac
