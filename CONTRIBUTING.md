# Contributing to millsymills.com

Personal site, but PRs from agents and humans both pass through `main`, so commit provenance has to be checkable.

## Commit signing (required on `main`)

Every commit that lands on `main` should carry a verified signing identity. Once the "Require signed commits" branch-protection rule is enabled on `main`, unsigned pushes bounce server-side; until then, treat this as a local convention and sign anyway so the toggle is a no-op when it lands.

SSH signing is the recommended path: it reuses the key you already use to authenticate to GitHub, has no expiry-management overhead, and avoids the GPG key-server dance.

### One-time setup (SSH signing)

1. Pick the SSH key you want to sign with. Reuse your auth key (`~/.ssh/id_ed25519` is fine) or generate a dedicated one (`ssh-keygen -t ed25519 -f ~/.ssh/git-signing -C "git signing"`).
2. Tell git to sign with SSH using that key:
   ```bash
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```
3. Upload the **public** key to GitHub twice, once as an authentication key (if not already) and once as a signing key:
   - Settings → SSH and GPG keys → New SSH key → Key type: **Signing Key**.
4. Configure the local allowed-signers file so `git log --show-signature` can verify your own commits (GitHub verifies remotely against your uploaded signing key regardless; this is for the local check below):
   ```bash
   echo "$(git config --get user.email) namespaces=\"git\" $(cat ~/.ssh/id_ed25519.pub)" >> ~/.ssh/allowed_signers
   git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
   ```
5. Verify locally before pushing:
   ```bash
   git commit --allow-empty -m "test: signed commit"
   git log --show-signature -1
   ```
   You should see `Good "git" signature for <email>`. Without step 4, this prints `No signature` and an `allowedSignersFile` error; the commit is still signed (and GitHub will accept it), but the local verifier can't check it.

### GPG fallback

If you'd rather use GPG (long-running release-signing key, hardware token, etc.), see GitHub's [GPG signing guide](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key#telling-git-about-your-gpg-key) and set `gpg.format gpg` instead. The branch protection rule accepts either.

### Agents (Claude Code, Codex, etc.)

Agents inherit the local `git` config, so as long as the host machine is set up per the steps above, agent-produced commits sign automatically. Verify after a session by running `git log --show-signature` on the branch; any unsigned commits mean the agent forked a shell with a stripped environment. Re-sign just the tip with `git commit --amend --no-edit -S`; for a chain of unsigned commits, use `git rebase --exec 'git commit --amend --no-edit --no-verify -S' <base>` (where `<base>` is the last signed commit, often `origin/main`) before pushing.

## Pull requests

PR + merge convention is in [`CLAUDE.md`](./CLAUDE.md) (squash to `main`, conventional-commit-style subject, rebase long-lived branches before filing). Run `npm run check` AND `npm run build` before pushing: `check` is type-only and skips PostCSS, so the build is what catches CSS parse errors.
