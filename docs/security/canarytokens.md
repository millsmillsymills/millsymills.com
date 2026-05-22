# Canarytokens runbook (#141)

Self-hosted [Thinkst Canarytokens](https://docs.canarytokens.org/guide/) on chimera. Tripwires across the site turn curiosity-driven probing into actionable alerts.

**This file documents the operator steps. The decode registry — what each fired token actually means — lives in `docs/security/canary-registry.md.age` (age-encrypted with the recipient at `public/age.pub`).**

## Why Thinkst, why on chimera

Per 2026-05-21 decision: avoid `canarytokens.org`-hosted tokens (attackers recognize the domain) → self-host. Thinkst's Docker image covers every token type the issue calls out (URL, AWS access key, PDF, etc.) in one container, with the alerting/routing UI built in. Chimera already runs Docker, lives on the Tailscale tailnet, and is the natural home for the unraid-mcp install (#60). One more container.

## Operator setup

### 1. Run Thinkst Canarytokens on chimera

```bash
# On chimera:
git clone https://github.com/thinkst/canarytokens-docker
cd canarytokens-docker
cp frontend.env.dist frontend.env
cp switchboard.env.dist switchboard.env
# Edit the .env files:
#   - CANARY_DOMAINS: a domain you control that resolves to chimera's
#     Tailscale Funnel address (e.g., canary.millsymills.com via a
#     CNAME). Tokens use this as their callback host.
#   - SWITCHBOARD_PUBLIC_IP: chimera's Tailscale Funnel IP, NOT the
#     LAN one — so the public callbacks resolve.
#   - CANARY_ALERT_EMAIL_FROM_DISPLAY, _ADDRESS, _USERNAME, _PASSWORD:
#     point at the Proton SMTP relay using a per-purpose alias
#     (`canary@millsymills.com` once the alias is created — Proton
#     MCP scope didn't allow creating it programmatically, do it in
#     Proton admin UI).
docker compose up -d
```

Verify the management UI is reachable at `https://canary.millsymills.com/` from your browser. The first request to that domain creates the admin password.

### 2. Generate three tokens

In the Thinkst admin:

1. **HTTP URL token** (the `/admin/backup/` tripwire).
   - Memo: `robots-txt /admin/backup/ trip`
   - Token type: HTTP
   - Copy the generated URL.
2. **AWS access key token**.
   - Memo: `inert AWS key planted in public/.env.example`
   - Token type: AWS Keys
   - Copy the generated `AKIA...` / secret pair.
3. **PDF token**.
   - Memo: `lure PDF at /docs/internal-runbook.pdf`
   - Token type: Acrobat Reader PDF
   - Download the generated PDF.

### 3. Plant the tokens

The placement steps land in a follow-up PR once the tokens exist:

| Token | Placement |
|---|---|
| HTTP URL | CloudFront cache-behavior: `/admin/backup/*` → 302 redirect to the Thinkst URL. Same behavior already added a `Disallow: /admin/backup/` line to `public/robots.txt`. |
| AWS key | `public/.env.example` (lives at `https://millsymills.com/.env.example` — publicly fetchable; attackers love `.env` files). Add a comment that looks like onboarding boilerplate. |
| PDF | `public/docs/internal-runbook.pdf` — referenced from a non-obvious HTML comment in a discoverable page. Filename + path designed to look like a recently-shipped internal doc. |

### 4. Encode the registry

```bash
# Build the decode table — what each token's memo maps to in this repo
cat > /tmp/canary-registry.md <<'EOF'
# Canary decode registry (PRIVATE)
#
# When a Thinkst alert fires, look up the memo line here to translate
# from token id to "what tripped and where it lives in the repo."

[robots-txt /admin/backup/ trip]
location: public/robots.txt (Disallow: /admin/backup/)
cf-behavior: /admin/backup/* -> 302 -> https://<chimera>.../<thinkst-id>
expected_hit: someone reading robots.txt and probing the disallowed path

[inert AWS key planted in public/.env.example]
location: public/.env.example
expected_hit: someone scraping .env.* from public sites trying the
              credentials in AWS

[lure PDF at /docs/internal-runbook.pdf]
location: public/docs/internal-runbook.pdf
expected_hit: someone curling unusual-looking PDFs to bypass site nav
EOF

# Encrypt to mills's age recipient (from public/age.pub)
age -r $(cat public/age.pub) -o docs/security/canary-registry.md.age /tmp/canary-registry.md
trash /tmp/canary-registry.md

# Commit the encrypted file. The plaintext registry never lives in the
# repo, never gets git-history-leaked.
git add docs/security/canary-registry.md.age
git commit -m "docs(security): seed canary registry (encrypted)"
```

To re-read the registry later:

```bash
age -d -i ~/path/to/your-age-key.txt docs/security/canary-registry.md.age | less
```

### 5. Wire the alerts to the right inbox

In Thinkst admin → Settings → confirm the SMTP relay sends to `canary@millsymills.com` (once that alias exists in Proton). For testing, an alias like `mills@` works.

## Reversal

To decommission a single token without losing the others, find its entry in the Thinkst admin and `Delete`. Token URL becomes 404. Update the registry in the same change.

To decommission the whole Thinkst stack on chimera: `docker compose down -v` + delete the CloudFront cache behavior + the PDF + the `.env.example` lines. Encrypted registry stays for audit until a separate cleanup pass.

## Refs

- Issue #141 (this).
- [canarytokens-docker](https://github.com/thinkst/canarytokens-docker) — the Thinkst Docker repo.
- [AWS credential canaries via Thinkst](https://blog.thinkst.com/2019/04/aws-canarytokens-from-canarytokensorg-now-with-trails-too.html).
- #582 — age recipient publication, used by the encrypted registry above.
