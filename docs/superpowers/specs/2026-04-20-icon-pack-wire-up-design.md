# Desktop icon-pack wire-up

**Status:** draft design, 2026-04-20
**Issue:** [#80](https://github.com/millsmillsymills/millsymills.com/issues/80)
**Depends on:** PR #78 (lands the icon assets under `public/images/icons/`)

**Goal:** replace the emoji glyphs on desktop-app icons with the y2k-themed PNGs from the vaporwave + web1.0 packs, while keeping emoji as a fallback for apps without a chosen icon.

## Why

PR #78 dropped 20 PNG icons into `public/images/icons/{vaporwave,web10}/` but did not wire them up. The desktop apps still render with emoji glyphs (`🪪`, `📄`, etc.), which work but read as placeholders against the rest of the y2k-styled chrome. Wiring the icons turns the desktop into something that feels actually built, not provisional.

## Scope

In:
- Data-model change on `AppDef`.
- Render changes in `src/components/desktop/DesktopIcon.astro` and the mobile-shell icon button inlined in `src/components/desktop/MobileFallback.astro`.
- CSS for the new `<img>` element in both desktop and mobile contexts.
- Populating the final mapping on 10 of 11 apps.

Out (tracked elsewhere):
- Remaining 5 icons for site-wide surfaces — cursor, hit counter, now-playing, online status, 404 page — tracked in [#81](https://github.com/millsmillsymills/millsymills.com/issues/81).
- 2x / retina variants of the icons. Single-resolution is fine; matches the y2k aesthetic.
- Refactoring `MobileFallback` to consume `DesktopIcon` instead of inlining its own button. Orthogonal to this work.

## Design decisions (locked during brainstorming)

1. **Coverage model: B (optional enhancement).** Add an optional `iconUrl` field; apps without one keep rendering their emoji. Avoids the "what icon fits `mail`?" trap and lets the design stay flexible as more icons get curated.
2. **Same icon both contexts.** Desktop and mobile render the same `iconUrl`. The mobile cream-tile background picks up the transparent PNG naturally.
3. **No `image-rendering: pixelated`.** The source PNGs are 700–1300px smooth illustrations (verified via `sips`), not pixel art. Default browser interpolation is correct.
4. **Image is decorative.** The adjacent text label is the accessible name; `<img alt="" aria-hidden="true">`. Matches the current `<span aria-hidden="true">` treatment for emoji.
5. **No wrapper component.** Inline conditional in two render sites is simpler than a new `AppIcon` abstraction. Threshold for a wrapper: >2 render sites.

## Architecture

### Data layer — `src/data/apps.ts`

Extend `AppDef`:

```ts
export interface AppDef {
  id: string;
  label: string;
  glyph: string;            // unchanged — still required, used as fallback
  iconUrl?: string;         // new — optional path to a PNG under public/
  title: string;
  ogDescription: string;
  x: number;
  y: number;
  width: number;
  height: number;
  desktopOnly?: boolean;
}
```

Populate `iconUrl` on 10 apps per the locked mapping:

| App id     | `iconUrl`                                          |
|------------|----------------------------------------------------|
| `resume`   | `/images/icons/vaporwave/floppy-disk.png`          |
| `photos`   | `/images/icons/web10/broken-image-netscape.png`    |
| `terminal` | `/images/icons/web10/windows-95-internet.png`      |
| `flags`    | `/images/icons/vaporwave/arcade-game.png`          |
| `projects` | `/images/icons/web10/under-construction-1.png`     |
| `uses`     | `/images/icons/web10/dial-up-days.png`             |
| `music`    | `/images/icons/vaporwave/cassette-tape.png`         |
| `memes`    | `/images/icons/vaporwave/japanese-wave.png`        |
| `mail`     | `/images/icons/web10/netscape-floppy.png`          |
| `trash`    | `/images/icons/vaporwave/dixie-cup.png`            |
| `about`    | *(no iconUrl — stays on 🪪)*                       |

### Rendering — `src/components/desktop/DesktopIcon.astro`

```astro
---
interface Props {
  target: string;
  label: string;
  glyph: string;
  iconUrl?: string;
}
const { target, label, glyph, iconUrl } = Astro.props;
---

<li>
  <button type="button" class="desktop-icon" data-open-window={target}>
    {iconUrl
      ? <img class="desktop-icon__icon" src={iconUrl} alt="" aria-hidden="true" />
      : <span class="desktop-icon__glyph" aria-hidden="true">{glyph}</span>}
    <span class="desktop-icon__label">{label}</span>
  </button>
</li>
```

`src/components/desktop/Desktop.astro` passes `iconUrl={a.iconUrl}` through.

### Rendering — `src/components/desktop/MobileFallback.astro`

The mobile shell inlines its own icon button at the existing `<span class="mshell-icon__glyph">` site. Swap that span for the same conditional:

```astro
{a.iconUrl
  ? <img class="mshell-icon__icon" src={a.iconUrl} alt="" aria-hidden="true" />
  : <span class="mshell-icon__glyph" aria-hidden="true">{a.glyph}</span>}
```

No new import, no component extraction.

### Styling — `src/styles/desktop.css`

Important: `.mshell-icon__glyph` *is* the cream tile (it has `background`, `border`, `border-radius`, `box-shadow` directly on the span — the emoji is centered inside it via flex). When `iconUrl` is set, we replace that span with an `<img>`, so the new image class has to carry the tile chrome itself.

Two new rules, side-by-side with the existing glyph rules:

```css
.desktop-icon__icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(2px 2px 0 var(--border));
}

.mshell-icon__icon {
  width: 56px;
  height: 56px;
  background: var(--cream);
  border: 2px solid var(--border);
  border-radius: 14px;
  box-shadow: 2px 2px 0 0 var(--border);
  object-fit: contain;
  padding: 6px;
}
```

Desktop: 48px matches the visual weight of the current 40px emoji once the drop-shadow is accounted for. Mobile: same 56×56 outer dimensions as `.mshell-icon__glyph`, same chrome (background / border / shadow), with 6px padding so the icon doesn't touch the tile edge. The `.mshell-icon__glyph` rule stays untouched — it only applies when an app has no `iconUrl`.

## Data flow

```
apps.ts (AppDef[])
  └── Desktop.astro (server render)
        ├── DesktopIcon.astro  — renders either <img> or <span>
        └── inline mobile icon button (MobileFallback.astro) — same branch
```

Static render only. No client JS involvement; the existing window-open handlers (`data-open-window=`) remain untouched.

## Error handling

If an `iconUrl` points at a missing file, the browser renders a broken-image placeholder. We could add an `onerror` fallback to the emoji, but:

1. CSP blocks inline `onerror=` handlers (per #46).
2. Broken-image state is a build-time regression, not a runtime error — caught by visual smoke.
3. Adding a fallback would require a client-side script import just for this.

**Decision:** no fallback. If a path breaks, fix the path. `npm run build` + browser smoke test catches it.

## Testing

- `npx astro check` — 0 errors / warnings / hints.
- `npm run dev` — visually confirm all 10 icons render on the desktop. Resize to mobile breakpoint (`<768px` or similar) and confirm mobile shell icons render. `about.me` should still show 🪪.
- `SITE_URL=https://millsymills.com npm run build` — succeeds. Verify `dist/images/icons/` ships the PNGs unchanged.
- Dev-server log — `/images/icons/*` returns 200 for the 10 wired apps, no 404 spam for the mapped icons.
- No unit tests — this is a static render + data change; the cost-to-value of adding test scaffolding for a feature with no runtime logic is negative.

## Risks

- **Aspect-ratio surprises.** Under-construction-1 is square, dial-up-days is 1369×994 (near 4:3), netscape-floppy is 817×885. `object-fit: contain` in a 48×48 box handles these, but a truly extreme aspect ratio would look small. All locked icons are >= 2:3 on both axes — manually spot-checked.
- **Visual weight mismatch between emoji and PNG apps.** `about.me` is the only emoji-rendered app; its 40px emoji sits next to 48px PNG icons. If that reads awkwardly in practice, the follow-up is either (a) pick a PNG for about too, or (b) nudge the icon sizes closer. Flag during dev-server smoke test.
- **CSP.** `img-src 'self' data:` is set on the CloudFront response headers policy in `infra/cloudfront.tf:36`. Same-origin PNGs work without any CSP update; no header changes needed for this PR.

## Implementation sequencing

1. Rebase `feat/icon-pack-wire-up` on top of `main` after PR #78 merges (needs the asset files to exist for the dev-server smoke test to pass).
2. Edit `AppDef` + populate `iconUrl` fields.
3. Edit `DesktopIcon.astro` (add prop + conditional).
4. Edit `Desktop.astro` (pass `iconUrl` through).
5. Edit `MobileFallback.astro` (inline conditional).
6. Add two CSS rules to `desktop.css`.
7. Verify locally (astro check + dev + build).
8. Open PR referencing #80.
