# Memes sync runbook (#250)

The memes gallery is generated from
[millsmillsymills/tech-memes](https://github.com/millsmillsymills/tech-memes),
vendored here as a git submodule at `vendor/tech-memes`. That repo's
`memes.json` (`{ id, file, alt }` per meme) is the single source of truth;
`src/data/memes.ts` and the images under `public/images/memes/` are **generated
artifacts** — do not hand-edit them.

## How it works

- `scripts/sync-memes.mjs` reads `vendor/tech-memes/memes.json`, validates it
  (unique ids, bare filenames, non-empty fields), copies the referenced images
  into `public/images/memes/`, and writes a `// @generated` `src/data/memes.ts`.
  Unit-tested in `tests/sync-memes.test.ts`.
- The generated `memes.ts` + the synced images are **committed**, so `npm run
  build` (and CI / deploy) need no submodule init — they consume the committed
  artifacts. Only refreshing from tech-memes touches the submodule.

## Add or change a meme

1. Add/modify the image + its `memes.json` entry in the tech-memes repo; merge
   there.
2. Here: `git submodule update --remote vendor/tech-memes` to pull the new
   tech-memes commit.
3. `npm run sync:memes` — regenerates `src/data/memes.ts` and re-copies images.
4. Delete any image under `public/images/memes/` no longer in the manifest (the
   sync copies in, it doesn't prune).
5. `npm run build` to verify, then commit the submodule bump + generated
   `memes.ts` + image changes in a PR. (Dependabot can be pointed at the
   submodule to open the bump PRs automatically.)

## History

The initial sync (#250) reconciled the two collections by average-hash: all 14
images then in tech-memes already matched site memes (renamed/reformatted);
`hac` and `hacker-knows-my-address` were live on the site but missing from
tech-memes, so they were backfilled there first
(millsmillsymills/tech-memes#2). The 14 site images committed under their old
names were then removed in favor of the tech-memes-named copies the sync
produces.
