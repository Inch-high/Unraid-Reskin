# Main page — storage tiles implementation plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. One commit per task after its steps pass. Design spec: [2026-05-31-main-page-storage-tiles-design.md](../specs/2026-05-31-main-page-storage-tiles-design.md). Mock: [docs/mocks/main-page/](../../mocks/main-page/).

**Goal:** Replace the v0.6.0 full-width device **rows** on `/Main` with a responsive grid of compact device **tiles** (type icon · name · model · state · used-of-total · temp/SMART/errors), grouped Array / Pool / Boot under a capacity hero. Ship the usage visual as a per-install **Bar / Ring** preference. **Presentation only** — no change to `main-state.php`, the store, nchan channels, actions, operation panels, or the device detail link-out. Ship as **v0.7.0**.

**Architecture:** A new `md-main-device-tile.ts` renders one `MainDevice` as a tile, reading the bar-vs-ring choice from `document.documentElement.dataset.modernuiMainUtil`. The three group cards (`md-main-array-card`, `md-main-pool-card`, `md-main-boot-card`) swap their `md-main-device-row` list for a `<div class="grid">` of tiles; array/pool totals move into a new `md-main-capacity-hero`. Device type (`hdd|ssd|nvme|usb`) is computed server-side in `main-state.php` and added to `MainDevice`. The preference flows through the **same machinery as the dashboard layout toggle**: `settings.cfg` → `modernui_generate_loader_js()` → `<html>` dataset → component.

---

## Task 1 — `deviceType` in the snapshot

- [ ] Add `deviceType: 'hdd' | 'ssd' | 'nvme' | 'usb'` to `MainDevice` in `src/ts/main/types.ts`.
- [ ] In `package/include/main-state.php` `modernui_normalize_device()`, derive it:
  `role === 'flash'` → `usb`; `linuxDevice` starts with `nvme` → `nvme`; else read
  `/sys/block/<basename(linuxDevice)>/queue/rotational` — `0` → `ssd`, else (or unreadable) → `hdd`.
  Guard the sysfs read (`@file_get_contents` + `is_readable`) so a missing read never throws and defaults to `hdd`.
- [ ] `tests/unit-ts/main/snapshot.test.ts`: extend fixtures so at least one device of each type is present; assert `deviceType` for nvme (by name), flash (by role), and an HDD fallback.
- [ ] `tests/unit-php/main-state.test.php` (if present): assert the nvme/flash/rotational branches; add a `rotational` fixture file under `__fixtures__` if needed.

## Task 2 — disk-type icons

- [ ] Add to `PATHS` in `src/ts/shell/icons.ts` (24×24, single path, paths in the spec table):
  `ssd` (`mdi-memory`), `nvme` (`mdi-expansion-card-variant`), `usb` (`mdi-usb`). `harddisk` already exists; alias or reuse it for `hdd`.
- [ ] Add a `deviceTypeIcon(t: MainDevice['deviceType']): string` helper (map type → icon key) next to the icon usage, or inline in the tile.

## Task 3 — `md-main-device-tile` component (bar + ring)

- [ ] New `src/ts/main/components/md-main-device-tile.ts` (Lit). Port markup + `static styles` from [mock.css](../../mocks/main-page/mock.css) `.tile*`, `.cap*`, `.ring`, `.foot-chip`, `.state` rules. Props: `device: MainDevice`, `util: 'bar' | 'ring'`.
- [ ] Render: type icon + name link (`detailHref`) + type tag; model; state dot/label from `spin`/`status`; capacity block (bar **or** ring per `util`); no-FS caption for parity/unmountable; footer temp · SMART glyph · errors. Reuse existing `formatBytes/formatTemp/formatCount/formatPct` and the `smartGlyph`/orb mappings already in `md-main-device-row.ts` (extract shared bits to `format.ts`/a helper rather than duplicate).
- [ ] Threshold classes: `high` ≥ 85, `full` ≥ 95 — identical to the row.
- [ ] `tests/unit-ts/main/md-main-device-tile.test.ts`: renders name/model/type-tag; standby dims + hides temp; problem status → red border class + red name; `util='ring'` renders `.ring` and the conic `--p`; `util='bar'` renders `.bar > span` width; parity (no FS) renders the caption not a bar.

## Task 4 — capacity hero

- [ ] New `src/ts/main/components/md-main-capacity-hero.ts`: array-wide used/total/free bar + protection summary (parity valid, device counts, healthy count). Inputs from the existing `MainArray` totals already on the store.
- [ ] `md-main-capacity-hero.test.ts`: used/free numerals, bar width = `utilizationPct`, `high` tint ≥ 85.

## Task 5 — swap cards from rows to tile grid

- [ ] `md-main-array-card.ts`, `md-main-pool-card.ts`, `md-main-boot-card.ts`: replace the `md-main-device-row` list with a `.grid` of `md-main-device-tile`, passing the resolved `util`. Keep the existing status pill / group header (parity-first ordering preserved).
- [ ] `md-main-page.ts`: render `md-main-capacity-hero` above the group cards; remove the per-card totals footer now covered by the hero. Operation panels render unchanged below.
- [ ] Retire `md-main-device-row.ts` + its test once nothing imports it (grep first). Keep `MAIN_ROW_COLUMNS` removal out of unrelated files.
- [ ] Update component tests for the cards to assert a tile grid renders one tile per device.

## Task 6 — in-page Bar / Ring toggle (`main_util_style`)

A one-click control in the `/Main` header, persisted via the stock save endpoint (same path
as the sidebar-collapse toggle). No Settings-page fieldset.

- [x] `package/include/save.php` `modernui_validate_settings()`: `$defaults['main_util_style']='bar'`, `$allowed['main_util_style']=['bar','ring']`.
- [x] `package/include/install.php` `modernui_generate_loader_js()`: emit `document.documentElement.dataset.modernuiMainUtil` (validated, fallback `'bar'`) alongside the existing dataset writes — gives no-flash restore on load.
- [x] `md-main-page.ts`: render a Bar/Ring segmented control in the header; reads `dataset.modernuiMainUtil` (default `'bar'`) and threads `util` to the cards/tiles. On click: set the dataset attribute, `requestUpdate()`, and POST `main_util_style` + `csrf_token` to `/plugins/unraid-modernui/include/save.php` (partial-merge).
- [x] `tests/unit-php/save.test.php`: `main_util_style=bar`/`=ring` save; `=donut` → `ok=false`; default `bar`.
- [x] `tests/unit-ts/main/page-util.test.ts`: dataset → rings; default bar; clicking the toggle flips cards to ring and POSTs `main_util_style=ring` to save.php.

> Verified live on the dev box: one-click flip is instant, and the choice survives reload
> (no flash) via the regenerated `loader.js`.

## Task 7 — styles + polish

- [ ] New tile rules into `src/styles/main-page.scss` only for anything not living in a component's `static styles` (e.g. the grid container, hero) — keep per-element styles in the components per existing convention.
- [ ] Verify light theme (`[data-theme="light"]`) tokens look right on tiles, ring track, and type tags.
- [ ] Manual responsive check: 1→N columns, no horizontal scroll ≥ 320px.

## Task 8 — verify on the live box + release

- [ ] Build (`npm run build`), deploy to the dev box (`MODERNUI_SSH_PORT=2929`, `root@10.10.10.10`), and check `/Main`: all device types iconed correctly, standby dims, a near-full disk tints, an error disk shows red, the **Bar / Ring** toggle in Settings flips and survives reload with no flash.
- [ ] Confirm live nchan updates still flow (spin a disk down, watch the dot + temp update) — proves the presentation swap didn't touch the data path.
- [ ] Version bump to **v0.7.0** (`chore(release)`), changelog entry, tag.

---

## Out of scope (unchanged from v0.6.0)

- `main-state.php` parsing (other than the one `deviceType` field), nchan channels, the store, actions, operation/parity/spin/power/encryption panels, the `.page` overlays and SHA backup/restore/safemode machinery, and the `/Main/Device` detail link-out.
- No per-disk sub-toggles; a single page-wide Bar/Ring preference only.
