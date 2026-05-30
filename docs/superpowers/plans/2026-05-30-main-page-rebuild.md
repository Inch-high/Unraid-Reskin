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

- [x] **Step 1:** Created `ArrayDevices.page` overlay. **Refinement (verified against the box):** `Title` is *omitted* (not preserved). In both `MainContentTabbed.php` and `MainContentTabless.php`, a page with no `Title` but with body text renders its content inline with no tab button and no title box — the "title-less parent page" path — so the single mount renders chrome-free in both layout modes. Header is just `Menu="Main:1"` + `Markdown="false"`; body emits `#modernui-main-root` (+ `data-csrf`) with a safemode/disabled guard.
- [x] **Step 2:** Created `CacheDevices.page` (`Main:2`) and `BootDevice.page` (`Main:3`) overlays — `Markdown="false"`, no `Title`, empty body.
- [x] **Step 3:** Created `ArrayOperation.page` overlay — **preserves `Nchan="device_list,disk_load,parity_list"`** and `Menu="Main:5"`, no `Title`, empty body. (Verified: `DefaultPageLayout` merges every `Main:N` page's `Nchan` regardless of Title/body, so the channels keep publishing.)
- [x] **Step 4:** Added a shared `modernui_main_overlay_table()` to [install.php](../../../package/include/install.php) and a replace loop in `modernui_install()` (reuses the SHA-backup `modernui_replace_file`).
- [x] **Step 5:** `modernui_generate_loader_js()` now injects `modernui-main.js` and sets `r.dataset.modernuiMain` from `$settings['main'] ?? 'on'`.
- [x] **Step 6:** `upgrade.php` tracked-overlay table now includes all four Main pages (drift → restore all + `safemode`); `uninstall.php` restores all four.
- [x] **Step 7:** `save.php` registers `main` (on/off), adds `modernui_replace_main_pages()`/`modernui_restore_main_pages()`, and wires the toggle + **disable restores stock Main / enable re-applies** (true stock fallback for this critical page). `Theme.page` has a "Main page layout: Modern/Stock" fieldset. Verified: `php -l` clean on all four; `tests/unit-php/install-main-replace.test.php` added and passing; full PHP suite green (except the pre-existing, unrelated `save-docker-autostart` flake).
- [ ] **Step 8 (DEFERRED — do not deploy a non-functional /Main to production):** The on-rig deploy + visual verify is intentionally held until the page is functional (after Tasks 6/9). Deploying now would replace the production array-management page with an empty mount. Plan: deploy once device tables + operation panel exist, then verify mount + `?modernui=off` + Main:Stock fallback, then immediately confirm restore. **Confirm with the user before first on-rig deploy.**
- [ ] **Step 9 (safety check — with Step 8):** Verify uninstall restores all four files byte-for-byte (SHAs vs `backups/`), and drift on any one triggers safe mode (restore all + flag). Validated in unit tests; on-box confirmation pairs with Step 8.
- [ ] Commit `feat(main): replace stock /Main pages with mount point + safe-mode + toggle`.

---

## Task 4: main-state.php snapshot endpoint (PHP, TDD)

**Files:** `package/include/main-state.php`, `tests/unit-php/main-state.test.php`, `tests/unit-php/run-all.mjs` (register)

- [x] **Step 1:** Wrote `tests/unit-php/main-state.test.php` — feeds the fixtures and asserts device counts, model/serial split, state/orb/temp/reads mapping, sizes, the NVMe pool (leader + 4 members, profile), flash, the raw operation fields (and that `primary` is NOT server-side), encryption `unlocked`, and the three `disks-enc-*.ini` → mode mappings.
- [x] **Step 2:** Implemented `main-state.php`:
  - Custom parsers `modernui_parse_ini_sections` (disks.ini `["name"]`+quoted values) and `modernui_parse_var_ini` (quoted flat var.ini — `modernui_parse_cfg` is for the *unquoted* settings.cfg and does NOT strip quotes; using it on var.ini was the first test failure).
  - `modernui_main_state($disks,$var,$csrf)` (pure) → array (parity-first, then data, by idx), pools (leader = Cache device with an FS block; members by `^leader\d+$`), boot (Flash), parity, operation (raw fields), encryption via `modernui_derive_encryption` (reproduces `check_encryption()`).
  - **operation.primary deliberately omitted** — `deriveOperation()` (Task 7) is the single source of truth; PHP emits raw fields only.
  - **Read-only.** No emcmd/curl/wget/shell. HTTP path refuses (409) when `disabled`/`safemode`.
- [x] **Step 3:** Test auto-discovered by `run-all.mjs`; `npm run test:php` green (incl. `main-state.test.php`), except the pre-existing `save-docker-autostart` flake. (PHP 8.2 installed locally via winget — memory updated.)
- [x] **Step 4 (rig check):** Ran the endpoint against the **real** live `disks.ini`/`var.ini` (copied to `/tmp`, PHP CLI, cleaned up — zero footprint, no page replaced): 14 array devices, 1 pool, flash boot, `mdState=STARTED`, `enc=unlocked`, correct model/serial/temp/reads/orb on a sample device, ~10 KB JSON. (CSRF not needed for the GET snapshot — confirmed.)
- [ ] Commit `feat(main): add read-only main-state.php snapshot endpoint (TDD)`.

---

## Task 5: snapshot.ts + store.ts + boot wiring (mount + paint)

**Files:** `src/ts/main/snapshot.ts`, `src/ts/main/store.ts`, `src/ts/main/boot.ts`, `tests/unit-ts/main/snapshot.test.ts`, `tests/unit-ts/main/store.test.ts`

- [x] **Step 1:** `snapshot.ts` — `fetchSnapshot()` GETs `main-state.php` (same-origin, no-store), throws on non-OK. Unit-tested against a **real** generated fixture `main-state.sample.json` (PHP run over the sample inis): asserts 14 devices, pool, flash, mdState, encryption, serial/model split, and that `primary` is absent (derived later).
- [x] **Step 2:** `store.ts` — minimal reactive store: `getState/isLoading/getBusy/setState/setBusy/subscribe`. `setState` stamps live `busy` onto operation; `setBusy` dedupes. 5 unit tests.
- [x] **Step 3:** Wired `boot.ts`: create store, mount `<modernui-main-page>` (new minimal root in `components/md-main-page.ts` — skeleton + summary, expanded in Task 6) into `#modernui-main-root`, read `csrf` from `root.dataset.csrf`, `await fetchSnapshot()` → `store.setState`.
- [x] **Step 4:** `tsc` clean on `src/ts/main/*`; `npm run test:ts` green (356, +7); `npm run build` emits `modernui-main.js`. (Test-file `node:` import warnings are the repo-wide pre-existing tsconfig quirk, not new.)
- [ ] Commit `feat(main): snapshot fetch + reactive store + mount/paint`.

---

## Task 6: Device tables — array, pools, boot (the 1:1 surface)

**Files:** `md-main-page.ts`, `md-main-array-card.ts`, `md-main-pool-card.ts`, `md-main-boot-card.ts`, `md-main-device-row.ts`, `format.ts`, `main-page.scss`, smoke tests

- [x] **Step 1:** `format.ts` — `formatBytes` (decimal/base-1000 like stock), `formatTemp`, `formatCount`, `formatPct`, `splitModelSerial`. 5 unit tests (15 cases).
- [x] **Step 2:** `md-main-device-row.ts` — custom element rendering the 11 columns: orb + name link (to `detailHref`, red on problem status) + sub-state label, **identification = model + serial** (+ SMART glyph), temp, reads, writes, errors (red when >0), FS, size, used, free, utilization bar (amber ≥85%, red ≥95%). Shared `MAIN_ROW_COLUMNS` grid template. Respects `compact`. Parity rows show dashes for FS/used/free. Smoke tests assert serial/model/reads/link/state/util/errors.
- [x] **Step 3:** A shared `md-main-card.ts` base (chrome + `col-head` header + sets `--main-row-cols` via `unsafeCSS`); `md-main-array-card.ts` (parity-first rows + totals), `md-main-pool-card.ts` (status pill ONLINE/DEGRADED/OFFLINE + profile + totals), `md-main-boot-card.ts` (flash usage). Smoke tests for array + pool.
- [x] **Step 4:** `md-main-page.ts` — composes array card + pool cards + boot card from the store; skeleton while loading; reads `data-modernui-density` → `compact`. (Operation panel slot reserved above the cards for Task 9.)
- [x] **Step 5:** `main-page.scss` — hides the empty stock `nav.tabs` shell via `#displaybox:has(#modernui-main-root)` and full-widths the mount; imported in `modernui.scss`. (Cards self-style via tokens in Shadow DOM.)
- [x] **Verify:** 367 TS tests pass (+11); `modernui.css` + `modernui-main.js` (32 KB) build; `src/ts/main` type-clean.
- [ ] **Step 6 (DEFERRED with Task 3 Step 8):** On-rig visual verify against `disks.ini` deferred until the operation panel (Task 9) exists, so we don't deploy a page that lists devices but can't Start/Stop the array. Confirm with user before first production deploy.
- [ ] Commit `feat(main): device tables — array, pools, boot with model+serial 1:1`.

---

## Task 7: deriveOperation() — array state machine (pure fn, exhaustive TDD)

> **The most important task in the phase.** Get this wrong and a user could be misled about whether it's safe to start the array.

**Files:** `src/ts/main/derive.ts`, `tests/unit-ts/main/derive.test.ts`

- [x] **Step 1:** Wrote `derive.test.ts` — **27 cases** covering every branch: `Started`→Stop enabled; busy 1/2/3→Stop disabled+reason; `Starting/Stopping/Formatting`→disabled spinner; `Copying/Clearing`→Cancel; all 5 `configValid` gates→Start disabled+reason; `STARTED/STOPPED/NEW_ARRAY`→Start enabled (+maintenance field, NEW_ARRAY unprotected warning); `STOPPED`+missing pool disk & `DISABLE_DISK` & `SWAP_DSBL` mid-copy→confirm-gated/disabled; `RECON_DISK` & `SWAP_DSBL` complete→enabled; all 6 `ERROR:*`→disabled+explanation. Uses `OperationState` literals (the var-*.ini→state mapping is covered by the PHP main-state test; re-parsing ini in TS would duplicate it).
- [x] **Step 2:** **Encryption gate** tested here too — `enter-new`/`missing-key`/`wrong-key`→Start disabled until key; `unlocked`→enabled; gate overrides an otherwise-enabled `RECON_DISK`. (The `EncryptionState.mode` *derivation* from disks.ini `luksState` lives in `main-state.php`'s `modernui_derive_encryption` and is tested in `main-state.test.php` against the three `disks-enc-*.ini` fixtures — single source, not duplicated in TS.)
- [x] **Step 3:** Implemented `deriveOperation(op, opts)` in `derive.ts` — faithful port of `ArrayOperation.page`'s `fsState → configValid → mdState` switch + the `check_encryption()` gate, with exact config/error/encryption reason text. `opts.missingPoolDisk` / `opts.swapCopyComplete` carry the two disk-level signals not in var.ini (page supplies them).
- [x] **Step 4:** `npm run test:ts` green — 394 total (+27); `src/ts/main` type-clean.
- [ ] Commit `feat(main): deriveOperation array state-machine fn (exhaustive TDD)`.

---

## Task 8: actions.ts — action proxies to stock endpoints (TDD)

**Files:** `src/ts/main/actions.ts`, `tests/unit-ts/main/actions.test.ts`

- [x] **Step 1:** `actions.test.ts` — asserts each pure builder's exact `{url, params}`: start (plain + maintenance/confirm/parity-valid/reformat/luksKey), stop, format, check(+correct), sync, clear, pause, resume, cancel, ParityControl stamp, spinAll/spinDisk/spinPool, clearStats, mover (Move/Empty), reboot(+safemode)/shutdown, keyfile upload/delete, pool precheck. Plus a `submit()` test proving form-urlencoding + `csrf_token` append.
- [x] **Step 2 (encrypted Start):** `submitEncryptedStart()` tested as a 1:1 `prepareInput()` sequence — pool precheck aborts on non-empty body (`wrong-pool-state`); non-ASCII passphrase rejected (`bad-passphrase`, **no** start posted, only the precheck call); passphrase path posts `luksKey=base64` + `cmdStart=Start`; keyfile path posts Report → `/update.php` upload → `/update.htm` start in order; `reformat` flows to `luksReformat=on`. (Mode *derivation* stays in PHP/`main-state.test.php`; retype-equality is enforced in the panel UI, Task 9.)
- [x] **Step 3:** Implemented `actions.ts` — pure builders + `submit()` (fetch, form-urlencoded, `same-origin`, csrf appended; fetch+resync instead of the stock `progressFrame` reload so the page stays mounted) + `submitEncryptedStart` / `submitParityPause` / `submitParityResume` sequencers + `isValidPassphrase`/`base64Passphrase`.
- [x] **Step 4:** 411 TS tests pass (+17); `src/ts/main` type-clean; builds.
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
