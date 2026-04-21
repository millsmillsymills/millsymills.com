#!/usr/bin/env bash
#
# Dump all LiveDNS records for a Gandi-managed domain as JSON.
# Usage:
#   GANDI_API_KEY=... ./scripts/gandi-snapshot.sh <domain>
#   # typically: ... > .local/gandi-<domain>-pre-cutover.json
#
# This is the rollback source of truth for NS-flip cutovers.
# Deliberately does not use MCP — a rollback snapshot must work
# without Claude Code attached.

set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
	printf 'usage: GANDI_API_KEY=... %s <domain>\n' "$0" >&2
	exit 2
fi

if [[ -z "${GANDI_API_KEY:-}" ]]; then
	printf 'error: GANDI_API_KEY env var is required. Get one from https://admin.gandi.net/organizations → Security → Personal Access Tokens.\n' >&2
	exit 2
fi

# LiveDNS API is at https://api.gandi.net/v5/livedns/domains/<fqdn>/records
curl -fsSL \
	-H "Authorization: Bearer ${GANDI_API_KEY}" \
	-H 'Accept: application/json' \
	"https://api.gandi.net/v5/livedns/domains/${DOMAIN}/records"
