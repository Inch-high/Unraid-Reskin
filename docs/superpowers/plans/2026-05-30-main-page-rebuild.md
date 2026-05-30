# Unraid ModernUI Main Page Rebuild Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One commit per task after its steps pass. Design spec: [2026-05-30-main-page-rebuild-design.md](../specs/2026-05-30-main-page-rebuild-design.md). Live-box research: [docs/research/main-page/](../../research/main-page/).

**Goal:** Replace Unraid 7.x's stock `/Main` rendering (four `.page` files) with a Lit-based UI that reproduces the array/device-management screen **1:1** — every device with model + serial, state, temp, reads/writes/errors, FS/size/used/free/utilization — plus the full Array Operation panel, reusing Unraid's backend for every action. Ship as **v0.6.0**.

**Architecture:** A new `modernui-main.js` bundle loads everywhere (via `loader.js`), self-detects `/Main`, and mounts `<modernui-main-page>` into the `#modernui-main-root` div emitted by our `ArrayDevices.page` overlay. It fetches `main-state.php` (parsed from `disks.ini` + `var.ini`) for a snapshot and subscribes to Unraid's nchan channels for live deltas. Every state-changing action POSTs to the **stock** endpoint (`/update.htm`, `ToggleState.php`, `Boot.php`, `ParityControl.php`, `update.php`) with the captured params — `emhttp` does all the work. Four stock `.page` files are SHA-backed-up, replaced, safe-mode-guarded, and uninstall-restored, exactly like Phase 5's `DockerContainers.page`.

**Tech stack:** Lit 3, TypeScript + Vite (existing pipeline), Vitest + jsdom for extractor/derivation/component tests, the existing SHA backup/restore/safemode machinery in `install.php`/`upgrade.php`/`uninstall.php`.

---

## File structure (end state)

```
package/
├── overlay/usr/local/emhttp/plugins/dynamix/
│   ├── ArrayDevices.page             NEW overlay — emits #modernui-main-root + safe-mode/disabled fallback
│   ├── CacheDevices.page             NEW overlay — empty stub (keeps Menu="Main:2")
│   ├── BootDevice.page               NEW overlay — empty stub (keeps Menu="Main:3")
│   └── ArrayOperation.page           NEW overlay — empty stub; PRESERVES Nchan="device_list,disk_load,parity_list"
├── include/
│   ├── main-state.php                NEW — read-only disks.ini + var.ini → JSON snapshot
│   ├── install.php                   MODIFY — back up + replace the 4 Main pages; loader injects modernui-main.js; data-modernui-main
│   ├── upgrade.php                   MODIFY — SHA-verify the 4 files on disks_mounted; restore + safemode on drift
│   ├── uninstall.php                 MODIFY — restore the 4 originals
│   └── save.php                      MODIFY — persist the `main` setting
src/ts/
├── modernui-main.ts                  NEW — IIFE entry; calls boot()
└── main/
    ├── boot.ts                       Page detection, mount, snapshot fetch, nchan subs, lifecycle
    ├── store.ts                      Reactive store (mirror docker/store.ts)
    ├── actions.ts                    Action proxies → stock endpoints (start/stop/parity/spin/mover/power)
    ├── snapshot.ts                   fetchSnapshot() → main-state.php
    ├── derive.ts                     deriveOperation(varIni-ish) — the pure state-machine fn
    ├── lifecycle.ts                  reuse/shared with docker lifecycle (visibility-aware nchan)
    ├── format.ts                     bytes/temp/serial-split helpers
    ├── types.ts                      MainPageState + sub-interfaces (see spec)
    ├── __fixtures__/
    │   ├── disks.ini.sample          captured
    │   ├── var.ini.sample            captured (Started/healthy)
    │   ├── var-stopped.ini           authored
    │   ├── var-new-array.ini         authored
    │   ├── var-disable-disk.ini      authored
    │   ├── var-parity-running.ini    authored
    │   ├── var-config-invalid.ini    authored
    │   ├── var-parity-running.ini    authored
    │   ├── disks-enc-enter-new.ini   authored (luks/auto, luksState=0 → "Enter new key")
    │   ├── disks-enc-missing.ini     authored (luksState=2 → "Missing key")
    │   ├── disks-enc-wrong.ini        authored (luksState=3 → "Wrong key" + permit-reformat)
    │   └── README.md                  fixture inventory + nchan/action shapes
    │   (unlocked mode → disks.ini.sample, luksState=1; encryption mode lives in disks.ini, not var.ini)
    └── components/
        ├── md-main-page.ts           root
        ├── md-main-array-card.ts
        ├── md-main-pool-card.ts
        ├── md-main-boot-card.ts
        ├── md-main-device-row.ts     ← model+serial+state+temp+R/W/err+FS+size/used/free+util
        ├── md-main-operation-panel.ts
        ├── md-main-encryption-fields.ts   ← Stopped-state passphrase/keyfile/reformat/delete-keyfile
        ├── md-main-parity-panel.ts
        ├── md-main-spin-controls.ts
        └── md-main-power-panel.ts
src/styles/
└── main-page.scss                    NEW — imported by modernui.scss
tests/
├── unit-ts/main/
│   ├── snapshot.test.ts              parse disks.ini/var.ini fixtures → MainPageState
│   ├── derive.test.ts               deriveOperation() across all var-*.ini states  ← critical
│   ├── actions.test.ts              each action builds the right endpoint+params
│   ├── format.test.ts
│   └── components/*.test.ts          smoke render per component
└── unit-php/
    ├── main-state.test.php           PHP parser → JSON shape
    └── install-main-replace.test.php SHA backup/restore for the 4 files
docs/superpowers/plans/2026-05-30-main-page-rebuild.md   (this file)
docs/superpowers/specs/2026-05-30-main-page-rebuild-design.md
```

---

## Plan-wide conventions

- **TDD for parsers/derivation:** author/capture the `.ini` fixture → write failing test asserting parsed/derived values → implement → green.
- **TDD for components:** smoke test (render with sample state, assert key text/structure) → implement → green.
- **Actions are pure builders:** `actions.ts` functions return `{url, params}` and a thin `submit()` performs the POST, so the params are unit-testable without a network.
- **Safety first on the operation panel:** never weaken a stock confirmation/gate. When in doubt, disable and show the stock reason text. `deriveOperation()` is the single source of truth and must be exhaustively tested.
- **Commits:** Conventional Commits, one per task, e.g. `feat(main): add device-row component and array card`.
- **Deploy cadence:** Task 3 (replace + empty mount) is the first deploy (blank modern page). Device tables deploy after Task 6. Operation panel after Task 8. Release is the final task.
- **Fixture capture (read-only) against the rig:** `ssh -p 2929 root@10.10.10.10 'cat …'`. Never mutate the box.

---

## Task 0 (optional, recommended): refactor shared lifecycle/store out of docker

The Docker rebuild already has a reusable `lifecycle.ts` (visibility-aware nchan) and a store shape. Before writing `main/`, check whether `src/ts/docker/lifecycle.ts` can be promoted to `src/ts/shared/lifecycle.ts` and imported by both. If the diff is small, do it; otherwise copy the pattern into `main/lifecycle.ts` and note the duplication for a later cleanup. Keep this task tiny — don't gold-plate.

- [ ] Evaluate `docker/lifecycle.ts` reuse; extract to `shared/` or copy
- [ ] `npm run test:ts` stays green
- [ ] Commit `refactor(shared): reuse visibility-aware nchan lifecycle` (only if extracted)

---

## Task 1: Capture live fixtures + author state variants

**Files:** `src/ts/main/__fixtures__/*`

- [x] **Step 1:** Copied the captured `disks.ini` / `var.ini` samples into `src/ts/main/__fixtures__/disks.ini.sample` and `var.ini.sample` (csrf already `REDACTED`; serials retained).
- [x] **Step 2:** nchan message shapes for `/sub/devices`, `/sub/mymonitor`, `/sub/arraymonitor`, `/sub/fsState`, `/sub/paritymonitor` documented in `__fixtures__/README.md` (sourced from `ArrayOperation.page` JS — browser capture is auth-gated on the rig).
- [x] **Step 3:** Authored state variants: `var-stopped.ini`, `var-new-array.ini`, `var-disable-disk.ini`, `var-config-invalid.ini`, `var-parity-running.ini`, and encryption variants `disks-enc-{enter-new,missing,wrong}.ini` (encryption mode lives in disks.ini `luksState`, not var.ini — corrected from the original plan naming).
- [x] **Step 4:** Action endpoints + params documented in `__fixtures__/README.md` from the stock `ArrayOperation.page`/`ToggleState.php`/`Boot.php` source. *(Open: a live DevTools Start/Spin-down POST capture from the rig is left as a TODO in the README to confirm header/body shape — source-derived params believed correct; emhttp validates server-side.)*
- [ ] Commit `test(main): capture live disks.ini/var.ini + author state fixtures`.

---

## Task 2: Bundle scaffold + types + page detection (no-op)

**Files:** `package.json` (already has Lit), `tools/build.mjs`, `src/ts/modernui-main.ts`, `src/ts/main/boot.ts`, `src/ts/main/types.ts`

- [x] **Step 1:** Added `'modernui-main'` to the Vite entry loop in [tools/build.mjs](../../../tools/build.mjs:20).
- [x] **Step 2:** Created `src/ts/main/types.ts` with the full interface set from the spec's Data Model (MainDevice, MainPool, ParityState, EncryptionState, OperationState/PrimaryControl, MainPageState).
- [x] **Step 3:** Created `src/ts/main/boot.ts` with page detection + enable gate (mirror docker's `onDockerPage`/`isDockerPageEnabled`):
  ```ts
  function onMainPage(): boolean { return /^\/Main\/?$/.test(window.location.pathname); }
  export function isMainPageEnabled(doc: Document): boolean {
    return doc.documentElement.dataset.modernuiMain !== 'off';
  }
  export async function boot(): Promise<void> {
    if (!isMainPageEnabled(document) || !onMainPage()) return;
    const root = document.querySelector<HTMLElement>('#modernui-main-root');
    if (!root) return; // stock page rendering → bail
    // mount/store/subs added in later tasks
  }
  ```
- [x] **Step 4:** Created `src/ts/modernui-main.ts`: `import { boot } from './main/boot'; void boot();`
- [x] **Step 5:** `npm run build` produces `package/theme/dist/modernui-main.js`; `tsc --noEmit` clean for the new files; `npm run test:ts` green (349 tests, no regression).
- [ ] Commit `chore(main): scaffold modernui-main bundle + types + page detection`.

---

## Task 3: Replace the four .page files + loader wiring + settings toggle (first deploy)

**Files:** four `package/overlay/.../dynamix/*.page`, `package/include/install.php`, `package/include/upgrade.php`, `package/include/uninstall.php`, `package/include/save.php`, `package/Theme.page`

- [ ] **Step 1:** Create `package/overlay/usr/local/emhttp/plugins/dynamix/ArrayDevices.page` — preserve the stock header block (`Menu="Main:1"`, `Title`, `Tag`, `Cond`), body emits the mount point + fallback (mirror [DockerContainers.page](../../../package/overlay/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page)):
  ```php
  <?php
  $safemode = is_file('/boot/config/plugins/unraid-modernui/safemode');
  $disabled = is_file('/boot/config/plugins/unraid-modernui/disabled');
  if ($safemode || $disabled): ?>
    <div style="padding:24px;color:#888;">Modern UI Main page is disabled. To restore stock UI, uninstall Modern UI or Settings → Theme → Disable.</div>
  <?php else: ?>
    <div id="modernui-main-root" data-modernui-main="mounted" data-csrf="<?=$var['csrf_token']??''?>"></div>
    <noscript><p style="padding:24px;color:#888;">Modern UI Main page requires JavaScript. Append <code>?modernui=off</code> for stock UI.</p></noscript>
  <?php endif; ?>
  ```
- [ ] **Step 2:** Create `CacheDevices.page` and `BootDevice.page` overlays — preserve their `Menu="Main:2"`/`Main:3"` headers, empty PHP body (`<?php /* content rendered by modernui-main */ ?>`).
- [ ] **Step 3:** Create `ArrayOperation.page` overlay — **preserve the full header including `Nchan="device_list,disk_load,parity_list"`** and `Menu="Main:5"`; empty body. (This keeps `emhttp` publishing the live channels.)
- [ ] **Step 4:** In [install.php](../../../package/include/install.php), add the four dynamix paths to the SHA-keyed `modernui_replace_file` list (follow the `DockerContainers.page` precedent — back up each original by SHA into `backups/`, then copy overlay).
- [ ] **Step 5:** In `install.php`'s `modernui_generate_loader_js()`, append injection of `modernui-main.js` (alongside dashboard/docker at [install.php:118](../../../package/include/install.php:118)) and add `r.dataset.modernuiMain=` from `$settings['main'] ?? 'on'`.
- [ ] **Step 6:** In `upgrade.php`, extend the `disks_mounted` SHA-verify loop to all four files; on drift restore all four + write `safemode`. In `uninstall.php`, restore all four originals.
- [ ] **Step 7:** In `save.php`, accept + persist `main` (on/off). In [Theme.page](../../../package/Theme.page), add a "Main page layout: Modern / Stock" fieldset (clone the Docker fieldset, lines 69–76).
- [ ] **Step 8:** Build + deploy + verify:
  ```powershell
  npm run build
  $env:MODERNUI_SSH_PORT="2929"; npm run dev-mirror -- root@10.10.10.10
  ```
  Open `https://10.10.10.10/Main`, hard-refresh. **Expected:** the stock array/device tables and operation panel are gone; you see an empty `#modernui-main-root` (and console boot log). `?modernui=off` → stock `/Main` returns. Settings → Theme → Main: Stock → stock returns.
- [ ] **Step 9 (safety check):** Verify uninstall restores all four files byte-for-byte (compare SHAs against `backups/`), and that drifting one file triggers safe mode (touch a stock file, fire `disks_mounted`, confirm restore + flag).
- [ ] Commit `feat(main): replace stock /Main pages with mount point + safe-mode + toggle`.

---

## Task 4: main-state.php snapshot endpoint (PHP, TDD)

**Files:** `package/include/main-state.php`, `tests/unit-php/main-state.test.php`, `tests/unit-php/run-all.mjs` (register)

- [ ] **Step 1:** Write `tests/unit-php/main-state.test.php` that feeds the `disks.ini.sample` + `var.ini.sample` fixtures (via a parser function taking file paths) and asserts the emitted JSON: device count, parity present, a data disk's model/serial split, NVMe pool leader fields, flash device, `mdState`/`fsState`, parity fields.
- [ ] **Step 2:** Implement `main-state.php`:
  - Parse `/var/local/emhttp/disks.ini` (`parse_ini_file(..., true)`) and `var.ini`.
  - Build `MainPageState`: split devices by `type` into array (parity+data), pools (group `Cache` by leader, read `pool_status_N`), flash. Compute orb/smart/utilization. Carry `numReads/Writes/Errors`, `temp`, FS fields. Split `id` → model/serial on last `_`.
  - Include the array/parity state fields from `var.ini`.
  - **Read-only.** No `emcmd`, no `curl/wget`, no shelling. Guard: refuse if `disabled`/`safemode` flag present.
  - Set `Content-Type: application/json`.
- [ ] **Step 3:** Register the test in `run-all.mjs`; `npm run test:php` green. (PHP not on PATH locally — see memory note; CI runs it. Document the winget hint if needed.)
- [ ] **Step 4 (rig check):** `ssh -p 2929 root@10.10.10.10 'curl -s http://localhost/plugins/unraid-modernui/include/main-state.php'` (after deploy) → valid JSON matching the live array. (Resolves spec open question on CSRF-for-GET.)
- [ ] Commit `feat(main): add read-only main-state.php snapshot endpoint (TDD)`.

---

## Task 5: snapshot.ts + store.ts + boot wiring (mount + paint)

**Files:** `src/ts/main/snapshot.ts`, `src/ts/main/store.ts`, `src/ts/main/boot.ts`, `tests/unit-ts/main/snapshot.test.ts`, `tests/unit-ts/main/store.test.ts`

- [ ] **Step 1:** `snapshot.ts` — `fetchSnapshot(): Promise<MainPageState>` GETs `main-state.php`. Unit-test against a JSON fixture (the captured endpoint output) for shape/typing.
- [ ] **Step 2:** `store.ts` — reactive store (mirror `docker/store.ts`): `getState/setState/subscribe`. Tests for set/notify/dedupe.
- [ ] **Step 3:** Wire `boot.ts`: create store, mount `<modernui-main-page>` into `#modernui-main-root`, read `csrf` from `root.dataset.csrf`, `await fetchSnapshot()` → `store.setState(...)`, render loading state first.
- [ ] **Step 4:** `npm run test:ts` green; build.
- [ ] Commit `feat(main): snapshot fetch + reactive store + mount/paint`.

---

## Task 6: Device tables — array, pools, boot (the 1:1 surface)

**Files:** `md-main-page.ts`, `md-main-array-card.ts`, `md-main-pool-card.ts`, `md-main-boot-card.ts`, `md-main-device-row.ts`, `format.ts`, `main-page.scss`, smoke tests

- [ ] **Step 1:** `format.ts` — `formatBytes`, `formatTemp`, `splitModelSerial`, `utilizationPct`. Unit tests.
- [ ] **Step 2:** `md-main-device-row.ts` — render: device icon (by `role`/`fsType`), name as link to `detailHref`, **identification = model + serial**, orb + state label, temp, reads, writes, errors, FS type, size, used, free, utilization bar. Smoke test asserts serial + reads/writes render. Respect `data-modernui-density`.
- [ ] **Step 3:** `md-main-array-card.ts` (parity + data rows, array totals), `md-main-pool-card.ts` (per pool: status text, profile, totals + rows), `md-main-boot-card.ts` (flash usage). Smoke tests.
- [ ] **Step 4:** `md-main-page.ts` — compose the cards from store slices; loading/empty states.
- [ ] **Step 5:** `main-page.scss` — card/table/orb styling reusing existing tokens + `status.scss`. Import in `modernui.scss`.
- [ ] **Step 6:** Build + deploy → **Expected:** `/Main` shows all devices with serials, temps, R/W/err, FS, sizes, utilization, matching stock field-for-field. Verify against `disks.ini` on the rig.
- [ ] Commit `feat(main): device tables — array, pools, boot with model+serial 1:1`.

---

## Task 7: deriveOperation() — array state machine (pure fn, exhaustive TDD)

> **The most important task in the phase.** Get this wrong and a user could be misled about whether it's safe to start the array.

**Files:** `src/ts/main/derive.ts`, `tests/unit-ts/main/derive.test.ts`

- [ ] **Step 1:** Write `derive.test.ts` covering **every** state from the spec, each loading a `var-*.ini` fixture (parsed to the `OperationState` inputs): `Started`→Stop enabled; `mymonitor` busy→Stop disabled+reason; `Starting/Stopping/Formatting`→disabled spinner; `Copying/Clearing`→Cancel; `Stopped`+`configValid=invalid/error/ineligible/nokeyserver/withdrawn`→Start disabled+reason; `STARTED/STOPPED/NEW_ARRAY`→Start enabled (NEW_ARRAY warn); `DISABLE_DISK/RECON_DISK/SWAP_DSBL`→Start+confirmStart; `ERROR:*` variants→Start disabled+explanation. Assert `{label, enabled, reason, requiresConfirm, requiresMaintenanceField}`.
- [ ] **Step 2:** **Encryption sub-derivation (`deriveEncryption(disks, var)`):** against `disks-enc-enter-new.ini` / `disks-enc-missing.ini` / `disks-enc-wrong.ini` (paired with `var-stopped.ini`) and `disks.ini.sample` (unlocked) assert `EncryptionState.mode` = `enter-new` / `missing-key` / `wrong-key` / `unlocked`, `keyfilePresent` (from `var.luksKeyfile`), and that Start gating is correct (disabled until passphrase/keyfile for the three key-needed modes; enabled for `unlocked`). Compute mode from per-disk `luksState` (1/2/3; 0+luks/auto → enter-new) + `fsType`/`defaultFsType` exactly per `ArrayOperation.page` lines 19–50.
- [ ] **Step 3:** Implement `deriveOperation()` + `deriveEncryption()` faithfully reproducing `ArrayOperation.page`'s nested switch + `check_encryption()` (reference [docs/research/main-page/ArrayOperation.page.txt](../../research/main-page/ArrayOperation.page.txt)).
- [ ] **Step 4:** `npm run test:ts` green for all states.
- [ ] Commit `feat(main): deriveOperation array state-machine fn (exhaustive TDD)`.

---

## Task 8: actions.ts — action proxies to stock endpoints (TDD)

**Files:** `src/ts/main/actions.ts`, `tests/unit-ts/main/actions.test.ts`

- [ ] **Step 1:** `actions.test.ts` — assert each builder returns the exact `{url, params}` from the spec's Endpoints table (use the Task 1 network capture as ground truth): start/stop/format/check(+correct)/sync/clear/pause/resume/cancel/spinAll/spinDisk/clearStats/mover/reboot/shutdown/keyfileDelete. Assert `csrf_token` and `startState` are included where stock includes them.
- [ ] **Step 2 (encrypted Start — its own tests, against `disks-enc-*.ini`):** assert the `startEncrypted()` builder/sequencer reproduces `prepareInput()` 1:1:
  - Pool precheck: POST `Report.php {cmd:'state', pools:'<csv>'}`; abort Start on non-empty response.
  - Passphrase path: reject non-`^[ -~]+$` input (no submit, surfaces the "Printable Characters Only" error); on valid input append `luksKey=base64(passphrase)` (assert exact base64) + `cmdStart=Start` + `startState`.
  - Keyfile path: POST `update.php {#file:'unused', #include:'webGui/include/KeyUpload.php', file:<dataURL>}` **then** submit Start.
  - `luksReformat` only included when explicitly enabled; `copy`/retype must equal `text` when reformat is on.
  - Delete-keyfile builder: `update.php {#file:'unused', #include:'webGui/include/KeyUpload.php', #apply:'Delete'}`.
- [ ] **Step 3:** Implement `actions.ts` — pure builders + a thin `submit(action)` that POSTs (form-urlencoded; reproduce `target=progressFrame` via hidden iframe or fetch+resync per the Task 1 finding). Take `csrf` + current `varIni`/`EncryptionState` as inputs.
- [ ] **Step 4:** Green; build.
- [ ] Commit `feat(main): action proxies to stock array/spin/power endpoints (TDD)`.

---

## Task 9: Operation panel + parity + spin + power components

**Files:** `md-main-operation-panel.ts`, `md-main-parity-panel.ts`, `md-main-spin-controls.ts`, `md-main-power-panel.ts`, smoke tests

- [ ] **Step 1:** `md-main-operation-panel.ts` — consume `OperationState`; render Start/Stop button (label/enabled/reason from `deriveOperation`), status orb (`mdColor`), maintenance checkbox, confirmStart gate, Format + confirm (when `unmountableMask`). Wire buttons to `actions.submit(...)`. Smoke tests for the key states.
- [ ] **Step 1b (encryption — Stopped state):** `md-main-encryption-fields.ts` — rendered by the operation panel only when `encryption.mode ∈ {enter-new, missing-key, wrong-key}`. Renders: the red status label, the Passphrase/Keyfile `input` select, passphrase field + `showPass` toggle, retype field (shown when `permit reformat` ticked), keyfile upload (FileReader→dataURL), the **"permit reformat"** checkbox (kept for stock parity but **guarded**: default off; ticking reveals an inline destructive warning; a reformat Start requires an explicit second confirm dialog/typed acknowledgment before `startEncrypted` fires — stricter than stock by design), and the **Delete keyfile** control when `keyfilePresent`. Disables Start until valid input (passphrase non-empty + printable-ASCII + matches retype when reformat, or keyfile chosen) — and, when reformat is on, until the second confirmation is given. Wire Start to `actions.startEncrypted(...)`. Smoke tests: inputs appear/hide per mode; Start gating; reformat reveals retype + warning + requires the extra confirm; unlocked mode shows nothing.
- [ ] **Step 2:** `md-main-parity-panel.ts` — Check(+correct)/Sync/Clear (whichever applies), Pause/Resume/Cancel during run, progress bar (`pct`/`speed`/`errors`), last-check summary, History link. 
- [ ] **Step 3:** `md-main-spin-controls.ts` — Spin Up all / Spin Down all / Clear Stats / reads-writes display toggle.
- [ ] **Step 4:** `md-main-power-panel.ts` — Move/Empty (mover, when `shareUser='e'`), Reboot, Shutdown, safe-mode checkbox (each with confirm).
- [ ] **Step 5:** Mount all in `md-main-page.ts`. Build + deploy. **Manual verification (carefully, on the rig):** Stop array, Start array, Spin down all, Clear Stats produce identical `emhttp` results to stock. Do parity start/cancel only if safe on the rig.
- [ ] Commit `feat(main): operation, parity, spin, and power panels`.

---

## Task 10: Live updates — nchan subscriptions + visibility lifecycle

**Files:** `src/ts/main/boot.ts`, `lifecycle.ts`

- [ ] **Step 1:** Subscribe to `/sub/devices`, `/sub/mymonitor`, `/sub/fsState`, `/sub/paritymonitor`, `/sub/arraymonitor` via the visibility-aware lifecycle helper. On any message → debounced (200ms) `fetchSnapshot()` → `store.setState`. Parse `mymonitor` int directly into `operation.busy` for instant button gating.
- [ ] **Step 2:** `visibilitychange`: pause processing on hide, one-shot resync on show. Add the lifecycle message counter for the hidden-tab test.
- [ ] **Step 3:** Deploy → spin a disk down / up on the rig and watch the row + button update within a debounce window. Toggle array state and confirm transitions reflect.
- [ ] Commit `feat(main): live nchan updates + visibility-aware lifecycle`.

---

## Task 11: Hardening, CI guards, docs, release v0.6.0

**Files:** `.github/workflows/ci.yml` (if grep guard added), `docs/compatibility.md`, `docs/manual-verification.md`, `README.md`, `unraid-modernui.plg`, `package/Theme.page` (version string), `CHANGELOG`/release

- [ ] **Step 1:** CI guard: `grep -E 'curl|wget|exec\(' package/include/main-state.php` must be empty; Playwright `document.scripts.length` constant on `/Main`. Add hidden-tab pause assertion.
- [ ] **Step 2:** Update `docs/compatibility.md` (note the four replaced dynamix files + safe-mode), `docs/manual-verification.md` (add a `/Main` 1:1 checklist: every device field, every operation control, encrypted-array gate, fallback paths).
- [ ] **Step 3:** Update README's feature list + the Theme.page "About" version, bump `unraid-modernui.plg` `<!ENTITY version>` to `0.6.0`.
- [ ] **Step 4:** Full `npm test` + `npm run build`; deploy to rig; run the manual checklist.
- [ ] **Step 5:** Release commit + tag `v0.6.0` (follow the repo's existing release flow / `release.yml`).
- [ ] Commit `chore(release): v0.6.0 — Main page rebuild`.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Wrong Start/Stop gating misleads user about array safety | `deriveOperation()` exhaustively unit-tested per state (Task 7); when uncertain, disable + show stock reason; never weaken a stock confirm |
| Replacing 4 core dynamix files breaks on Unraid update | Per-file SHA backup + `disks_mounted` verify + restore-all + safe-mode flag (Task 3); uninstall byte-restores |
| Action params drift from stock → emhttp rejects / misfires | Params captured empirically from the rig (Task 1) and unit-tested (Task 8); `emhttp` validates server-side regardless |
| Encrypted-array key entry mishandled (fails to unlock, or worse, `luksReformat` wipes data) | Reproduce `check_encryption()`/`prepareInput()` 1:1; `deriveEncryption()` + `startEncrypted()` unit-tested against the `disks-enc-*.ini` fixtures; base64 + printable-ASCII validation enforced; "permit reformat" default-off with explicit data-loss warning, never auto-checked; `Report.php` pool precheck preserved; manual checklist on an encrypted test array |
| Stopped-state disk assignment not rebuilt | Out of scope v1 — link out to stock; documented; Start/Stop still fully works |
| nchan resync too coarse for sub-second stats | Acceptable for v1; documented v1.1 path to parse `/sub/devices` HTML deltas |
| Per-device detail page not rebuilt | Click-through preserved to stock `DeviceInfo.page`; nothing lost |
```
