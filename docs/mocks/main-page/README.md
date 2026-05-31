# Main (Storage) page — storage-tile redesign mocks

Static HTML/CSS mocks for refining `/Main` away from the long 11-column device table and
toward a **compact tile grid**, in the spirit of the Dashboard cards, without losing the
information that matters at a glance.

Tokens, radii, fonts, and dot colors mirror [src/styles/tokens.scss](../../../src/styles/tokens.scss),
so what you see here is what the shipped Lit components will paint.

Design rationale and the full data mapping live in
[docs/superpowers/specs/2026-05-31-main-page-storage-tiles-design.md](../../superpowers/specs/2026-05-31-main-page-storage-tiles-design.md).

## Open the mocks

```bash
# from repo root
start docs/mocks/main-page/index.html
```

| File | Shows |
|---|---|
| [index.html](index.html) | The full page, with a live **Bar / Ring** toggle in the header |
| [mock.css](mock.css) | All styles — tweak here to evolve the look |

The **Bar / Ring** toggle switches how every disk's usage is drawn **in place** — bar
(used/total + fill bar, matches the current device row and dashboard card) or ring (a radial
gauge with used/total/free beside it). The choice is remembered (localStorage in the mock;
a per-install `settings.cfg` key in the shipped plugin) and restored with no flash on reload,
so each user keeps the style they prefer rather than us picking one for everyone.

## What each tile keeps (the "critical info")

- **Identity + type** — name, model, and an HDD / SSD / NVMe / USB icon + tag
- **Storage use** — used-of-total + utilization, amber ≥ 85 %, red ≥ 95 %
- **Online / sleep state** — a colored dot: active · standby · spinning-up · problem
- **Health** — temperature · SMART glyph · error count (red when non-zero)

Reads, writes, and the discrete free-bytes column move to the link-out detail page — they
stay in `MainDevice`, just off the tile face.

## Demonstrated states (fixture)

The fixture is deliberately mixed so every visual state is visible at once:

- `parity` active · `parity2` **standby** (dimmed, no FS, temp `—`)
- `disk1` normal · `disk2` **95 % full** (red bar/ring) · `disk3` standby
- `disk4` **SMART warning + 2 errors** (red border) · `disk5` **82 %** (amber) · `disk6` **unmountable** (red, no FS)
- `cache` + `cache2` — **NVMe** pool (zfs mirror), icon tinted accent
- `flash` — **USB** boot device, vfat, no temp/SMART

## Device-type icons

Material Design inline SVG, same convention as [src/ts/shell/icons.ts](../../../src/ts/shell/icons.ts)
(24×24, single path, `currentColor`). Ready to drop into the `PATHS` map:

| Type | MDI icon | Notes |
|---|---|---|
| HDD | `mdi-harddisk` | already in `icons.ts` as `harddisk` |
| SSD | `mdi-memory` | flash chip |
| NVMe | `mdi-expansion-card-variant` | M.2 add-in card |
| USB/boot | `mdi-usb` | flash drive |

Type is derived server-side from data already parsed: `role === 'flash'` → USB;
`linuxDevice` starts with `nvme` → NVMe; else rotational flag (`/sys/block/<dev>/queue/rotational`)
picks SSD vs HDD. See the spec for the `deviceType` field added to `MainDevice`.

## After sign-off — next steps

1. Add the icon paths to [src/ts/shell/icons.ts](../../../src/ts/shell/icons.ts) and a
   `deviceType` field to `MainDevice` + `modernui_normalize_device()` in `main-state.php`.
2. Wire the in-page **Bar / Ring** toggle to persist: a `main_util_style` key in `settings.cfg`
   → `loader.js` → `data-modernui-main-util` on `<html>` (no-flash restore), with the header
   toggle POSTing to `save.php` on click (see the spec for the exact touches). No Settings fieldset.
3. Build the tile as a Lit component under `src/ts/main/components/` (e.g. `md-main-device-tile.ts`),
   moving the per-element styles from [mock.css](mock.css) into its `static styles = css\`…\`` block,
   and reading the dataset attribute to pick bar vs ring.
4. Swap the device list inside `md-main-array-card` / `md-main-pool-card` / `md-main-boot-card`
   from rows to a tile grid; lift array totals into the capacity hero.
5. The data layer, nchan channels, and live-update debounce from the v0.6.0 rebuild are
   unchanged — this is presentation only.

> These mocks are static: they don't demonstrate the live nchan updates or the
> zero-`<script>`-injection / no-blocking-I/O performance discipline, but the spec carries
> those forward as unchanged acceptance criteria from the v0.6.0 rebuild.
