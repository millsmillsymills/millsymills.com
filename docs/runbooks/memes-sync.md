# Memes sync runbook (#250)

Goal: the memes gallery stops being hand-maintained in two places (an image in
`public/images/memes/` plus a row in `src/data/memes.ts`). Instead the
[millsmillsymills/tech-memes](https://github.com/millsmillsymills/tech-memes)
repo is the single source of truth, vendored as a git submodule, and a
build-time script regenerates `src/data/memes.ts` + copies the images.

## What's landed (this PR)

- `scripts/sync-memes.mjs` — the generator. `parseManifest` validates a
  `{ id, file, alt }[]` manifest (unique ids, bare filenames, non-empty
  fields); `renderMemesModule` emits a `// @generated` `src/data/memes.ts`.
  Unit-tested in `tests/sync-memes.test.ts`.
- `scripts/memes.manifest.seed.json` — a starter manifest generated from the
  current 16-entry `src/data/memes.ts`, alt text included. This is the seed to
  drop into tech-memes (see the content decision below).

`src/data/memes.ts` is **not** yet flipped to generated — that's the activation
step, gated on the content decision and on PR #631 (which also edits
`memes.ts`) landing first to avoid a conflict.

## The content decision (needs the maintainer)

The two repos' contents diverge: the site has 16 curated memes (images here,
alt text in `memes.ts`); tech-memes currently has 14 *different* images with no
manifest and no alt text. Pick the source-of-truth direction:

1. **Lift the current gallery into tech-memes.** Commit `memes.manifest.seed.json`
   (as `memes.json`) and the 16 images from `public/images/memes/` into
   tech-memes. The gallery is unchanged; tech-memes becomes authoritative
   losslessly. New memes are then added in tech-memes going forward.
2. **Adopt tech-memes' collection.** Author `id` + alt text for the 14 (and any
   future) tech-memes images. The gallery changes to that set. Alt text is
   accessibility content the maintainer authors/reviews.

A merge of both is possible but is just (1) followed by (2).

## Activate (after the decision + #631 merge)

1. Ensure tech-memes carries `memes.json` (the `{ id, file, alt }[]` manifest)
   and the image files alongside it.
2. Add the submodule: `git submodule add https://github.com/millsmillsymills/tech-memes vendor/tech-memes`.
3. Add an npm `sync:memes` script:
   `node scripts/sync-memes.mjs vendor/tech-memes/memes.json vendor/tech-memes`,
   and run it on `prebuild` so every build regenerates `src/data/memes.ts` and
   re-copies images.
4. Wire CI + deploy to `git submodule update --init` before `npm run build`.
5. Point Dependabot at the submodule so the pinned SHA bumps land as PRs.
6. Commit the now-generated `src/data/memes.ts` (with its `// @generated`
   header) — it must not be hand-edited thereafter.
