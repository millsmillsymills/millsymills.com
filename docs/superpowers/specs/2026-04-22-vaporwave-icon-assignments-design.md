# Vaporwave icon assignments — about / incidents / privacy

**Status:** draft design, 2026-04-22
**Depends on:** [icon-pack wire-up](./2026-04-20-icon-pack-wire-up-design.md) (already landed — `AppDef.iconUrl` field and render branches already exist)

**Goal:** replace the emoji-glyph fallback on three desktop apps (`about`, `incidents`, `privacy`) with icons drawn from the "VAPORWAVE USER INTERFACE" MISC ICONS pack, landing them under `public/images/icons/vaporwave/` alongside the existing assets.

## Why

After the icon-pack wire-up, 10 of 13 apps have a PNG; the remaining apps fall back to emoji. The three covered here (`about`, `incidents`, `privacy`) currently render as `🪪`, `🚨`, `🔒` — legible, but they read as placeholders next to the rest of the y2k-styled chrome. Three additional icons from the same illustrated family close most of the remaining gap without a redesign.

## Scope

In:
- Copy three source PNGs out of `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/` into `public/images/icons/vaporwave/` under descriptive filenames.
- Add `iconUrl` to three entries in `src/data/apps.ts`: `about`, `incidents`, `privacy`.
- Visually verify at desktop + mobile sizes via `npm run dev`.

Out (tracked elsewhere):
- **`vscode`** — deferred. User will file a separate issue with a specific direction. No icon is assigned here and the emoji fallback (`🆅`) stays in place. Do **not** touch the `vscode` entry as part of this work.
- Migrating other file-type apps (`resume`, `projects`, `mail`) into the document-frame visual family from this pack. Worth considering later, but out of scope now.
- Retina / 2x variants. Single-resolution is fine per the pack's aesthetic, matching the existing assets.

## Design decisions (locked during brainstorming)

1. **Icon pool: anything that fits** — the repo already mixes `icons/vaporwave/` and `icons/web10/` across apps. No requirement to pick exclusively from the Downloads pack, though all three picks here happen to land in it.
2. **Renaming from source filenames.** The pack's files are `vaporwave ui_misc icon-NN.png`. Destination filenames follow the existing hyphen-case noun convention (`floppy-disk.png`, `cassette-tape.png`, etc.) — no "icon-NN" numeric names in the repo.
3. **Document-frame icons (01–12) are a coherent subfamily.** One of the three picks (`icon-12` on `privacy`) uses the document-frame motif; the other two (`icon-13`, `icon-22`) are standalone illustrations. The pack has enough document-frame motifs to eventually migrate other file-ish apps (`resume`, `projects`, `mail`) into that subfamily, but this spec does not commit to it.
4. **`icon-22` (shield crest) defaulted to `about`, not `privacy`.** Both interpretations hold, but `privacy` has a better literal option (`icon-12`, file-with-key). Using the crest on `about` also reads as a personal seal, which the about page's identity framing benefits from.

## Icon selections

### `about` → `icon-22` (shield / emblem with gold compass center)

| Field | Value |
|---|---|
| Source | `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-22.png` |
| Destination | `public/images/icons/vaporwave/crest.png` |
| `iconUrl` | `/images/icons/vaporwave/crest.png` |

**Rationale.** Reads as a personal crest / seal. Security-engineer flavored without being literal (no lock/badge/shield-of-protection iconography leaking into a page that's about identity, not authZ). Replaces the `🪪` ID-card glyph.

### `incidents` → `icon-13` (yellow warning triangle with `!`)

| Field | Value |
|---|---|
| Source | `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-13.png` |
| Destination | `public/images/icons/vaporwave/warning-triangle.png` |
| `iconUrl` | `/images/icons/vaporwave/warning-triangle.png` |

**Rationale.** The universal hazard/incident glyph, already rendered in the pack's illustrated style. Replaces the `🚨` siren emoji with something that scans identically at a glance but fits the chrome.

### `privacy` → `icon-12` (document with key + music note)

| Field | Value |
|---|---|
| Source | `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/vaporwave ui_misc icon-12.png` |
| Destination | `public/images/icons/vaporwave/keyed-file.png` |
| `iconUrl` | `/images/icons/vaporwave/keyed-file.png` |

**Rationale.** A file with a literal key on it maps cleanly onto "encrypted / private file", and the file-based motif matches how the rest of the document-frame icons read. The decorative music-note on the page reads as noise at small sizes — the key is the legible element. Replaces the `🔒` padlock glyph.

## Architecture

No architectural changes. `AppDef.iconUrl` already exists (from the icon-pack wire-up). Both `DesktopIcon.astro` and the mobile-shell icon button already branch on `iconUrl` vs. emoji glyph. This change is asset + data.

## Implementation

1. **Copy assets.** Copy the three source PNGs from `~/Downloads/VAPORWAVE USER INTERFACE/PNG/MISC ICONS/` into `public/images/icons/vaporwave/` under the destination filenames listed above. Do not re-encode or optimize — the source files are already tiny (<8KB each).
2. **Edit `src/data/apps.ts`.** Add one `iconUrl` line to each of the three affected entries. Do not reorder entries. Do not touch `vscode`.
   - `about` gains `iconUrl: '/images/icons/vaporwave/crest.png'`
   - `incidents` gains `iconUrl: '/images/icons/vaporwave/warning-triangle.png'`
   - `privacy` gains `iconUrl: '/images/icons/vaporwave/keyed-file.png'`
3. **Verify locally.** `npm run dev`, confirm all three icons render on the desktop + mobile surfaces, then `npm run build` to catch any PostCSS-adjacent breakage. `npm run check` alone is not sufficient (doesn't run PostCSS).

## Testing

No new tests. Existing typecheck + build are enough:

- `npm run check` — passes; `AppDef` shape unchanged.
- `npm run build` — passes.
- Manual: desktop + mobile shell each show the three icons at their expected positions, no 404s in the devtools network tab.

## Out of scope

- `vscode` icon. User is filing a separate issue with the exact direction. Emoji fallback stays.
- Migration of `resume`/`projects`/`mail`/etc. into the document-frame icon subfamily (`icon-04`/`07`/`08`/`09`/`10`/`11`) for visual coherence. Real option, but a separate design conversation.
- Icon licensing / attribution audit for the Downloads pack. Assumed handled outside this spec.
