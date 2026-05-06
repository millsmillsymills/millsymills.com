---
title: Override yaml@2.8.4 to clear GHSA-48c2-rrv3-qjmp
date: 2026-05-06
category: dependencies
module: build-deps
problem_type: supply_chain
component: package.json
severity: moderate
applies_when:
  - Reviewing `package.json#overrides` for stale entries
  - Adding new yaml-touching deps and wondering whether the override still applies
  - `npm audit` after a major @astrojs/check / astro bump comes back clean for yaml
related_prs:
  - "#330"
related_advisories:
  - GHSA-48c2-rrv3-qjmp
affected_files:
  - package.json
tags:
  - dependencies
  - npm-overrides
  - supply-chain
  - dev-time
  - astro
---

## Problem

`npm audit` flagged 5 moderate `yaml` advisories: GHSA-48c2-rrv3-qjmp, "Stack Overflow via deeply nested YAML collections," affecting `yaml` 2.0.0–2.8.2. Pulled into the dep tree via two transitive chains:

- `@astrojs/check` → `@astrojs/language-server` → `volar-service-yaml` → `yaml-language-server` → `yaml`
- `astro` → `vite` → `yaml`

The advisory is dev-time only — Astro frontmatter parsing during build, plus the LSP integration in editors. There is no runtime path from user input to a `yaml.parse` call in this site (verified during review of #330: `src/content.config.ts` exports an empty `collections`, all `.md` reads use Vite's `?raw` suffix, CI's `pull_request`/`push` triggers are commented out, deploy never runs on PR head). The `npm audit` signal still surfaces on every install, though.

`npm audit`'s only suggested fix was a major-version *downgrade* of `@astrojs/check` to 0.9.2, which throws away forward fixes. Not a fix.

## Fix

Use `package.json#overrides` to force every consumer to a non-vulnerable yaml version. From #330:

```json
{
  "overrides": {
    "yaml": "2.8.4"
  }
}
```

Why this works:

- `yaml-language-server`'s `peerDependencies.yaml` is `"*"`, so it accepts 2.8.4.
- `@astrojs/yaml2ts@0.2.3` declares `yaml: "^2.8.2"` — 2.8.4 satisfies.
- `vite@7.3.2` declares `yaml: "^2.4.2"` (optional) — 2.8.4 satisfies.
- npm dedupe collapses every `node_modules/yaml` path to the same 2.8.4 install.
- Verified under the CI runtime (Node 22.22.2 / npm 10.9.7 via `docker run --rm node:22`): `npm ci` clean, `npm audit` reports zero vulnerabilities, `astro check` 0/0/0 across 117 files, `astro build` 19 pages, `vitest run` 70/70.

The pin is exact (`"2.8.4"`, not `"^2.8.3"`) because every other devDependency in this repo is exact per CLAUDE.md's "pin exact versions (no `^` or `~`)" rule.

## Drop-when condition

The override is scaffolding, not architecture. Drop it (delete the `overrides` block in `package.json` and re-run `npm install`) when **`npm audit` reports zero `yaml` advisories *without* the override** — i.e. when the upstream chain (`@astrojs/check` → `@astrojs/language-server` → `volar-service-yaml` → `yaml-language-server`, or `astro` → `vite`) ships its own non-vulnerable yaml resolution.

Quick check: `git stash` the override, `trash node_modules && npm install`, `npm audit`. If clean, drop the override permanently. If still flagged, restore.

## Why a co-located doc

`package.json` doesn't support comments, so the rationale ("which advisory, what chains, when to drop") would otherwise live only in the PR body — invisible the moment GitHub history becomes harder to retrieve. The override is the kind of stale-config trap CLAUDE.md's "Replace, don't deprecate" rule warns about; an in-tree marker keeps the drop trigger visible.
