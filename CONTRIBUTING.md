# Contributing to millsymills.com

Personal site, but PRs from agents and humans both pass through `main` — so commit provenance has to be checkable.

## Commit signing (required on `main`)

Every commit that lands on `main` must carry a verified signing identity. Branch protection enforces this server-side; sign locally so your push doesn't bounce.

SSH signing is the recommended path — it reuses the key you already use to authenticate to GitHub, has no expiry-management overhead, and avoids the GPG key-server dance.

### One-time setup (SSH signing)

1. Pick the SSH key you want to sign with. Reuse your auth key (`~/.ssh/id_ed25519` is fine) or generate a dedicated one (`ssh-keygen -t ed25519 -f ~/.ssh/git-signing -C "git signing"`).
2. Tell git to sign with SSH using that key:
   ```bash
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```
3. Upload the **public** key to GitHub twice — once as an authentication key (if not already), and once as a signing key:
   - Settings → SSH and GPG keys → New SSH key → Key type: **Signing Key**.
4. Verify locally before pushing:
   ```bash
   git commit --allow-empty -m "test: signed commit"
   git log --show-signature -1
   ```
   You should see `Good "git" signature for <email>`.

### GPG fallback

If you'd rather use GPG (long-running release-signing key, hardware token, etc.), see GitHub's [GPG signing guide](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key#telling-git-about-your-gpg-key) and set `gpg.format gpg` instead. The branch protection rule accepts either.

### Agents (Claude Code, Codex, etc.)

Agents inherit the local `git` config, so as long as the host machine is set up per the steps above, agent-produced commits sign automatically. Verify after a session by running `git log --show-signature` on the branch — an unsigned commit at the top means the agent forked a shell with a stripped environment; re-sign with `git commit --amend --no-edit -S` before pushing.

## Pull requests

- Squash-merge to `main` (`gh pr merge <N> --squash`). Subject line follows `<type>(<scope>): <summary> (#<pr>)` — one logical change per merged commit.
- Rebase or merge `origin/main` into long-lived feature branches before opening a PR; review upstream-collision fixes in the same PR rather than as follow-ups.
- Run `npm run check` and `npm run build` before pushing — the build also catches PostCSS parse errors that `check` misses.
