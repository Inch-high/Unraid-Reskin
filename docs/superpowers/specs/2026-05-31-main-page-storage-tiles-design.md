# Main page — storage tiles redesign

**Status:** design / mock review
**Date:** 2026-05-31
**Supersedes the row table introduced by:** [2026-05-30-main-page-rebuild-design.md](2026-05-30-main-page-rebuild-design.md) (data layer, endpoints and live-update model are unchanged — this is a presentation-only change)
**Mocks:** [docs/mocks/main-page/](../../mocks/main-page/) — `index.html`, with a live **Bar / Ring** toggle

## Problem

The v0.6.0 `/Main` rebuild renders every device as a full-width row in an 11-column
grid (`md-main-device-row.ts`: Device · Identification · Temp · Reads · Writes · Errors ·
FS · Size · Used · Free · Utilization). It is information-dense but reads as a long,
flat list — the same shape as stock Unraid. On a 24-bay server it is a wall of numbers,
and the columns that matter at a glance (is it up? how full? is it healthy?) are buried
among columns that don't (reads/writes counts).

## Goal

Replace the long row table with a **responsive grid of compact disk tiles**, echoing the
Dashboard's card language, while keeping every piece of *critical* per-disk information:

- **Identity** — name (`disk1`, `parity`, `cache`), model, and **device type** (HDD / SSD / NVMe / USB) shown as an icon + tag
- **Storage use** — used-of-total + utilization, with amber ≥ 85 % and red ≥ 95 % thresholds (same as today)
- **Online / sleep state** — active · standby (spun down) · spinning-up · problem, via a colored state dot
- **Health** — temperature, SMART glyph, and error count (errors highlighted red when non-zero)

Demoted to the link-out detail page (they remain in `MainDevice`, just off the tile face):
reads, writes, raw FS size, free bytes as a discrete column. Free is still shown in the
ring variant's caption and is derivable everywhere.

## Layout

```
Main  ● Array Started · 8 array devices · 2 pool · 1 boot        [Bar|Ring]  [Stop Array]
┌─ capacity hero ─────────────────────────────────────────────────────────────┐
│  38.3 TB used of 72 TB                        33.7 TB free                    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░     Valid · 2+6 · 7/8 healthy                       │
└──────────────────────────────────────────────────────────────────────────────┘

Array   ● Parity valid                                       ▮▮▮▯▮▮▮▮  (LED strip)
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 💽 disk1  HDD │ │ 💽 disk2  HDD │ │ 💽 disk3  HDD │ │ 💽 disk4  HDD │  …auto-fill grid
│ WDC WD140EFGX │ │ TOSHIBA MG09 │ │ ST12000VN     │ │ WDC WD120EFBX │
│ 8.21 / 12 68%│ │ 11.4 /12  95%│ │ 2.10 /12  18%│ │ 6.70 /12  56%│
│ ▓▓▓▓▓░░░ amber│ │ ▓▓▓▓▓▓▓ red  │ │ ▓░░░░░░       │ │ ▓▓▓░░░░       │
│ 38° ✓ 0err   │ │ 41° ✓ 0err   │ │ —° ✓ 0err     │ │ 39° ! 2err   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

cache   ● Online · zfs · mirror · 421 GB of 1.86 TB
┌──────────────┐ ┌──────────────┐
│ ▦ cache  NVMe│ │ ▦ cache2 NVMe│   (NVMe icon tinted accent)
└──────────────┘ └──────────────┘

Boot    vfat · flash device
┌──────────────┐
│ ⚡ flash  USB │
└──────────────┘
```

- Tiles flow in `grid-template-columns: repeat(auto-fill, minmax(266px, 1fr))` — 1 column on
  narrow viewports, up to ~4 on a wide desktop.
- Devices stay grouped by their existing structures: **Array** (parity-first), each **Pool**,
  and **Boot**. Group headers carry the status pill + totals that the cards carry today
  (`md-main-pool-card` status, `md-main-array-card` totals).
- A thin **LED strip** in the Array header gives the whole-array glance the dashboard has
  (one bar per device, colored by state).
- A **capacity hero** at the top replaces the per-card totals footer with a single
  array-wide used/free bar + protection summary.

## Device-type icons

The tile's leading icon distinguishes drive class. Icons follow the existing Material
Design inline-SVG convention in [src/ts/shell/icons.ts](../../../src/ts/shell/icons.ts)
(24×24 viewBox, single path, `currentColor` fill) so they drop straight into the `PATHS`
map. Three new entries plus the existing `harddisk`:

| Type | Icon key | MDI source | Path `d` |
|------|----------|-----------|----------|
| HDD (rotational) | `hdd` (existing `harddisk`) | `mdi-harddisk` | `M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2H6M6,4H18V12H16V14H14V12H10V14H8V12H6V4Z` |
| SSD (SATA, non-rotational) | `ssd` | `mdi-memory` | `M17,17H7V7H17M21,11V9H19V7C19,5.89 18.1,5 17,5H15V3H13V5H11V3H9V5H7C5.89,5 5,5.89 5,7V9H3V11H5V13H3V15H5V17A2,2 0 0,0 7,19H9V21H11V19H13V21H15V19H17A2,2 0 0,0 19,17V15H21V13H19V11M13,13H11V11H13M15,9H9V15H15V9Z` |
| NVMe (M.2) | `nvme` | `mdi-expansion-card-variant` | `M2 7H4.5V17H3V8.5H2M22 7V16H14V17H7V16H6V7M10 9H8V12H10M13 9H11V12H13M20 9H15V14H20V9Z` |
| Boot flash | `usb` | `mdi-usb` | `M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.79,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z` |

### Deriving device type

`MainDevice` does not yet carry a type. It is derivable from data already parsed by
`main-state.php`:

- `role === 'flash'` → **USB**
- `linuxDevice` starts with `nvme` → **NVMe**
- otherwise consult the disk's rotational flag → `0` = **SSD**, else **HDD**

`disks.ini` does not expose rotational directly; `/sys/block/<dev>/queue/rotational` does.
Add a `deviceType: 'hdd' | 'ssd' | 'nvme' | 'usb'` field to `MainDevice` computed
server-side in `modernui_normalize_device()` (nvme by name; rotational read from sysfs with
an HDD fallback so a missing read never mislabels a spinning disk). This keeps the front end
a pure function of the snapshot, consistent with the existing design.

## Utilization visualization — both, user-selectable

Rather than the project picking one, the tile ships **both** and lets each user choose via a
**Bar / Ring** toggle in the page header. Both share the identical tile, head, state dot, and
footer; only the capacity block differs:

- **Bar** (default) — used/total numerals above a 7px fill bar + %. Identical visual grammar
  to `md-main-device-row` and the dashboard `md-array-card`.
- **Ring** — a 66px radial gauge (CSS `conic-gradient`, hollow center shows %), used/total/free
  beside it. More "widget" feel; the % reads instantly; costs a little vertical height.

Threshold colors are shared: accent < 85 %, `--warning` ≥ 85 %, `--danger` ≥ 95 %.

### Persisting the choice

A one-click **Bar / Ring** segmented control sits in the `/Main` page header (above the
capacity hero). Clicking it flips every tile in place *and* persists the choice, so it sticks
on reload — combining the instant feedback of an in-page control with the durability of a
setting. Persistence reuses the existing settings machinery (same `settings.cfg` →
`loader.js` → `<html>` dataset path as the [dashboard layout toggle](2026-05-25-dashboard-layout-toggle-design.md)),
so there's no flash of the wrong style on first paint.

| Layer | Change |
|---|---|
| `settings.cfg` | key `main_util_style` · string · default `"bar"` · allowed `"bar"`, `"ring"` |
| `include/save.php` | `main_util_style` in `$defaults` + `$allowed` (reject other values) |
| `include/install.php` | `modernui_generate_loader_js()` emits `document.documentElement.dataset.modernuiMainUtil` (validated, falls back to `"bar"`) |
| `md-main-page.ts` | renders the header toggle; on click sets the dataset attribute, re-renders the tiles, and POSTs `main_util_style` to `save.php` (partial-merge, exactly like the sidebar-collapse toggle) |
| device tile | reads the resolved `util` and renders bar or ring accordingly |

There is **no** Settings-page fieldset for this — the in-page toggle is the single control.
(The static mock simulates the same behaviour client-side with a `<head>` no-flash script +
`localStorage`.)

## State mapping

| Tile element | Source on `MainDevice` | Notes |
|---|---|---|
| state dot + label | `spin` / `status` | active=`--success`, standby=`--text-muted`, spinning-up=`--warning`, problem=`--danger` |
| `is-standby` (dim) | `spunDown` | tile at 82 % opacity; temp shows `—` |
| `is-problem` (red border + red name) | `status ∈ {invalid,wrong,disabled,missing,unmountable}` | mirrors the current `PROBLEM` set |
| capacity block | `fsUsedBytes`/`fsSizeBytes`/`utilizationPct` | parity & unmountable show a no-FS caption with raw `sizeBytes` |
| temp chip | `tempC` | `—` when null (spun down / unavailable) |
| SMART glyph | `smart` | ✓ healthy · ! warning · ✕ failed · ? unknown — same glyphs/colors as today |
| error chip | `numErrors` | red + bold when > 0 |

## Non-goals

- No change to the data layer, endpoints, nchan channels, or live-update debounce.
- Operation panels (start/stop, parity check, spin controls, encryption unlock) are unchanged
  and continue to render below the device grid.
- The link-out device detail page (`/Main/Device?name=…`) is unchanged.

## Acceptance criteria

1. Every `MainDevice` that renders a row today renders a tile, grouped identically (Array
   parity-first, each Pool, Boot), with no data regressions for the four critical facts
   (identity+type, storage use, state, health).
2. Tiles reflow responsively (1→N columns) with no horizontal scroll at any width ≥ 320px.
3. Device-type icon is correct for HDD / SSD / NVMe / USB across the fixture set.
4. Standby disks dim and hide temperature; problem disks show red border + red name.
5. Utilization thresholds (85/95) tint bar/ring identically to the current row.
6. Both bar and ring ship; the in-page **Bar / Ring** toggle flips tiles instantly, persists
   per-install via `main_util_style`, and is restored with no flash of the wrong style on first paint.
