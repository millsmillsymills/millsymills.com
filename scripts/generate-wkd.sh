#!/usr/bin/env bash
# Regenerate the WKD (Web Key Directory) artifacts for mills@millsymills.com.
#
# WKD spec: the binary public key lives at
#   /.well-known/openpgpkey/hu/<zbase32(sha1(localpart))>
# and an empty 'policy' file lives alongside. Mail clients that support WKD
# (Thunderbird, Mailvelope, `gpg --locate-keys`) auto-discover the key via
# the domain's web-known path.
#
# Run this once on key creation, and again on every key rotation. The output
# files must be committed.
set -euo pipefail

UID_EMAIL="mills@millsymills.com"
OUT_DIR="public/.well-known/openpgpkey"

# Extract the WKD zbase32 hash from GPG. --with-wkd-hash prints the hash line
# near the UID in the format '<32-char-zbase32>@millsymills.com'. Grab the
# first one that matches the expected shape.
HASH=$(gpg --with-wkd-hash --list-keys "$UID_EMAIL" \
	| grep -oE '\b[ybndrfg8ejkmcpqxot1uwisza345h769]{32}@' \
	| head -1 \
	| sed 's/@$//')

if [[ -z "$HASH" ]]; then
	echo "error: could not extract WKD hash for $UID_EMAIL — is the key in your keyring?" >&2
	exit 1
fi

mkdir -p "$OUT_DIR/hu"

# Export the minimized binary key (no third-party signatures) to its WKD-named file.
gpg --yes --output "$OUT_DIR/hu/$HASH" \
	--export-options export-minimal --export "$UID_EMAIL"

# 'policy' must exist; can be empty per the WKD spec.
touch "$OUT_DIR/policy"

echo "WKD hash:   $HASH"
echo "WKD file:   $OUT_DIR/hu/$HASH"
echo "Policy:     $OUT_DIR/policy"
echo
echo "Test locally after 'npm run build':"
echo "  curl -I http://localhost:4321/.well-known/openpgpkey/hu/$HASH"
echo
echo "Test post-deploy:"
echo "  gpg --locate-keys --auto-key-locate wkd $UID_EMAIL"
