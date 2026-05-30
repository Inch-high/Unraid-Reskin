# Phase 6: Main page rebuild — replace, with 1:1 array/device parity

**Date:** 2026-05-30
**Scope:** Replace Unraid 7.x's stock `/Main` page rendering surface with a clean Lit-based UI that reproduces the array/device-management screen **1:1** — every device (parity, data, pool/cache, flash) with its identification (model + serial), state, temperature, reads/writes/errors, filesystem, size/used/free/utilization, plus the full Array Operation panel (Start/Stop array, encryption, format, parity check/sync/clear, pause/resume/cancel, history, spin up/down all, clear stats, mover, reboot/shutdown). Reuses Unraid's existing array backend (`emhttp`/`emcmd` via the documented endpoints, nchan streams) — we replace **only the front-end**. Ships as v0.6.0.
**Status:** Draft for review
**Target box validated against:** Unraid **7.3.1** (`HL15Rack`, AMD EPYC 8124P) — captures under [docs/research/main-page/](../../research/main-page/).

## Problem

`/Main` is Unraid's most critical management screen — it controls array start/stop, disk assignment, parity, encryption, and shutdown. The stock page is a jQuery + emhttp-pushed-HTML architecture:

1. **Rows are not rendered by any on-disk PHP.** The `.page` files (`ArrayDevices.page`, `CacheDevices.page`, `BootDevice.page`) only emit column `<thead>`s and empty placeholder `<tbody>` rows (`<tr><td colspan='10'></td></tr>` per slot). The actual row HTML is **pushed live by the `emhttp` C daemon over nchan `/sub/devices`**, and jQuery sets `$('#'+rowId).html(...)`. There is no server-side template we can restyle in place.
2. **The data is locked behind that HTML.** Per-device truth lives in `/var/local/emhttp/disks.ini`; array/parity state lives in `/var/local/emhttp/var.ini`. The stock page never exposes this as data — only as daemon-rendered table cells.
3. **The Array Operation panel is a dense state machine** (`ArrayOperation.page`) — the Start/Stop button label, enabled state, gating checkboxes, encryption inputs, and parity controls are all derived from a nested `fsState → mdState → configValid` switch. It is correct but visually dated and hard to extend.

The Dashboard (Phase 3) *overlays* `/Main`'s device tables as a read-only summary by scraping the daemon-pushed HTML. That works for a summary; it cannot work for `/Main` itself, where users **manage** the array.

## Solution

### Architecture: replace, don't overlay (decision confirmed with stakeholder)

We extend the SHA-keyed backup-and-replace mechanism already used for `DefaultPageLayout.php` and `DockerContainers.page` (see [install.php](../../../package/include/install.php)) to cover the **four** `.page` files that compose `/Main`. We reuse Unraid's backend for every state-changing action — `emhttp` still performs all array work. We only own the markup and the client-side state derivation.

| Path (under `/usr/local/emhttp/plugins/dynamix/`) | Action | Why |
|---|---|---|
| `ArrayDevices.page` (`Main:1`) | **Replace** with our shell that mounts `<modernui-main-page>` | The single mount point for the whole page |
| `CacheDevices.page` (`Main:2`) | **Replace** with an empty stub (renders nothing) | Content now comes from our root component |
| `BootDevice.page` (`Main:3`) | **Replace** with an empty stub | ″ |
| `ArrayOperation.page` (`Main:5`) | **Replace** with an empty stub that **preserves the `Nchan="device_list,disk_load,parity_list"` header attribute** | Keeps `emhttp` publishing the live channels we subscribe to |
| `disks.ini`, `var.ini` | **Read-only** (parsed by our snapshot endpoint) | Single source of truth |
| `/update.htm`, `ToggleState.php`, `Boot.php`, `ParityControl.php`, `update.php` | **Untouched** — we POST to them exactly like stock | All array work stays in Unraid's hands |

> **Why four files.** `/Main` is an `xmenu` tab whose stub `Main.page` (`Menu="Tasks:1"`, `Code="e908"`) carries no layout; the content is concatenated from the four `Main:N` sibling pages. There is no way to neutralise the stock content without owning each contributing file. Each replacement is SHA-tracked individually.

Safe-mode behaviour (identical to Docker): on every `disks_mounted` event, `upgrade.php` SHAs each of the four current files against the recorded originals. If Unraid changed any of them underneath us (e.g. a 7.4 update), we restore **all four** originals and write `/boot/config/plugins/unraid-modernui/safemode`; the overlay shells detect the flag and render the stock-fallback notice instead of mounting. A dashboard banner offers an update check. Uninstall byte-restores all four.

### Why this is *not* as risky as it sounds

"Full replacement" here replaces **rendering and form construction only**. Every destructive or state-changing operation is a POST to the *same* Unraid endpoint the stock page uses, with the *same* field names and values (captured empirically — see §Endpoints). `emhttp` validates and executes; if our params are wrong, Unraid rejects them exactly as it would a malformed stock request. We never write to `disks.ini`/`var.ini`, never call `emcmd` directly, never re-implement the array state machine's *execution* — only its *display*.

### The data path

```
User navigates to /Main
  ↓
ArrayDevices.page (our shell, ~40 lines PHP) emits:
   <div id="modernui-main-root" data-csrf="<?=$var['csrf_token']?>"></div>
   (the other 3 Main:N pages emit nothing; ArrayOperation keeps its Nchan= attr)
  ↓
modernui-main.js boots → mounts <modernui-main-page>, then in parallel:
  • GET /plugins/unraid-modernui/include/main-state.php   (full snapshot from disks.ini + var.ini)
  • NchanSubscriber('/sub/devices')      → device/temp/io/spin deltas
  • NchanSubscriber('/sub/mymonitor')    → 0 idle | 1 parity | 2 mover | 3 btrfs (gates buttons)
  • NchanSubscriber('/sub/fsState')      → transitional state strings (Starting/Stopping/…)
  • NchanSubscriber('/sub/paritymonitor')→ parity started/stopped while idle → resync
  • NchanSubscriber('/sub/arraymonitor') → array config changed → resync
  ↓
First paint (~1 frame after the snapshot fetch resolves)
  ↓
Reactive store; on any nchan signal → debounced (200ms) resync of main-state.php
  ↓
visibilitychange: pause delta processing on hide; one-shot resync on show
```

No `setTimeout` polling loop, no `$('head').append('<script>')`, no shelling, no external HTTP — same architectural invariants the Docker rebuild enforces (CI grep + Playwright `document.scripts.length` guard).

> **Live-stats note.** v1 resyncs the whole snapshot on every nchan signal (debounced). `disks.ini` is a tmpfs file — re-parsing it is sub-millisecond, and the snapshot is a few KB. If profiling shows the resync is too coarse for sub-second temp/IO updates, a v1.1 optimisation can parse the `/sub/devices` HTML payload (a `{rowId: "<td>…"}` JSON map) for per-cell deltas without a round-trip. Out of scope for the first cut.

### Data model

```ts
// src/ts/main/types.ts
type DeviceRole = 'parity' | 'data' | 'pool' | 'flash';
type DeviceSpin = 'active' | 'standby';                 // from `spundown` (0/1)
type SmartHealth = 'healthy' | 'warning' | 'failed' | 'unknown';

// Mirrors disks.ini `status` plus FS state. Drives the orb + label 1:1 with stock.
type DeviceStatus =
  | 'ok'            // DISK_OK
  | 'new'           // DISK_NEW
  | 'invalid'       // DISK_INVALID
  | 'wrong'         // DISK_WRONG
  | 'disabled'      // DISK_DSBL / DISK_NP_DSBL
  | 'missing'       // *_MISSING
  | 'unmountable'   // fsStatus = Unmountable…
  | 'notpresent';   // DISK_NP (empty slot — filtered from device list, shown only when Stopped)

interface MainDevice {
  name: string;            // disks.ini `name`  (parity, parity2, disk1…, cache…, flash)
  role: DeviceRole;        // from `type`
  linuxDevice: string;     // `device`  (sdX / nvmeXn1)
  model: string;           // `id` before the last '_'
  serial: string;          // `id` after the last '_'      ← the user-requested 1:1 field
  status: DeviceStatus;
  spin: DeviceSpin;
  spunDown: boolean;
  tempC: number | null;    // `temp` ('*' / spun-down → null)
  numReads: number | null;
  numWrites: number | null;
  numErrors: number | null;
  fsType: string | null;   // `fsType` (luks:xfs, luks:zfs, vfat, …); null for parity
  encrypted: boolean;      // fsType starts with 'luks:'
  sizeBytes: number | null;        // `size` ×1024 (raw)
  fsSizeBytes: number | null;      // `fsSize`
  fsUsedBytes: number | null;      // `fsUsed`
  fsFreeBytes: number | null;      // `fsFree`
  utilizationPct: number | null;   // fsUsed / fsSize
  color: string;           // raw `color` token (green-on / green-blink / yellow-on / …)
  orb: 'green' | 'grey' | 'yellow' | 'red';   // derived from color (+ spundown)
  smart: SmartHealth;      // derived from `warning`/`critical`/numErrors
  detailHref: string;      // /Main/Device?name=<name>   (link-out to stock detail page)
}

interface MainPool {            // one per pool_deviceN tbody (cache, cache_apps, …)
  id: string;                   // pool leader name
  label: string;
  statusText: string;           // 'ONLINE' | 'OFFLINE' | 'DEGRADED' (pool_status_N)
  fsType: string | null;
  fsProfile: string | null;     // raidz1, raid1, …
  sizeBytes / usedBytes / freeBytes / utilizationPct;
  devices: MainDevice[];
}

interface ParityState {
  action: 'check' | 'recon' | 'clear' | null;   // parsed from var.ini mdResyncAction
  correcting: boolean;
  running: boolean;          // mdResync > 0
  paused: boolean;
  posBytes: number | null;   // mdResyncPos
  sizeBytes: number | null;  // mdResyncSize
  pct: number | null;
  speed: string | null;      // computed from mdResyncDb/Dt
  errors: number | null;     // sbSyncErrs
  corrected: number | null;  // mdResyncCorr
  last: { date: string; durationText: string; speed: string; errors: number } | null;  // sbSynced/sbSynced2
  scheduleEnabled: boolean;
}

// The button/gating model — the heart of 1:1 fidelity. Derived purely from var.ini.
interface OperationState {
  fsState: string;           // Started | Stopped | Starting | Stopping | Formatting | Copying | Clearing
  mdState: string;           // STARTED | STOPPED | NEW_ARRAY | DISABLE_DISK | RECON_DISK | SWAP_DSBL | ERROR:* …
  mdColor: string;           // status orb beside the label
  protected: boolean;
  configValid: string;       // yes | error | invalid | ineligible | nokeyserver | withdrawn
  startMode: string;         // Normal | Maintenance
  counts: { disks; disabled; invalid; missing; new; };
  unmountableMask: number;   // fsUnmountableMask → enables Format
  encryption: EncryptionState;   // Stopped-state passphrase/keyfile surface (see below)
  // Derived UI verdict (computed by a pure, unit-tested function):
  primary: {
    label: 'Start' | 'Stop' | 'Starting…' | 'Stopping…' | 'Formatting…' | 'Cancel';
    enabled: boolean;
    reason: string | null;          // why disabled / what confirmation is needed
    requiresConfirm: boolean;       // DISABLE_DISK / RECON_DISK / SWAP_DSBL → confirmStart checkbox
    requiresMaintenanceField: boolean;
  };
  busy: 0 | 1 | 2 | 3;       // from /sub/mymonitor — disables Stop/Mover/Spin with a reason
}

// Encrypted-array key entry. Only surfaced when fsState=Stopped AND a luks
// member needs a key. Derived from var.ini + per-disk luksState (1/2/3) and
// fsType (luks:* or auto-with-luks-default). Reproduces check_encryption()
// in ArrayOperation.page exactly — getting this wrong can fail to unlock or,
// worse, trigger a data-destroying reformat.
interface EncryptionState {
  required: boolean;          // $encrypt — any luks/auto member present
  // Mutually exclusive trigger → drives the red status label + whether inputs show:
  mode: 'enter-new' | 'missing-key' | 'wrong-key' | 'unlocked' | 'none';
  //   enter-new  ($forced)        → "Enter new key"   (new/auto luks disk; setting the key)
  //   missing-key (luksState=2)   → "Missing key"
  //   wrong-key   (luksState=3)   → "Wrong key"       (offers "permit reformat")
  //   unlocked                    → key already known (keyfile present) — NO inputs shown, Start enabled
  //   none                        → array not encrypted
  keyfilePresent: boolean;    // file_exists(var.luksKeyfile) → show "Delete keyfile" form
  allowReformat: boolean;     // user ticked luksReformat ("permit reformat") — DANGER: re-encrypt/wipe
  // Pool names to validate via Report.php before Start (prepareInput precheck):
  poolNames: string[];
}

interface MainPageState {
  array: { devices: MainDevice[]; ... };   // parity + data disks
  pools: MainPool[];
  boot: MainDevice | null;
  parity: ParityState;
  operation: OperationState;
  serverVersion: string;
  csrfToken: string;
}
```

### Endpoints

**New (ours) — read-only snapshot:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/plugins/unraid-modernui/include/main-state.php` | Parses `disks.ini` + `var.ini`, returns the typed `MainPageState` JSON. No external calls, no `emcmd`, no shelling, read-only. Mirrors `docker-state.php`. |

**Reused (Unraid's) — every action POSTs to the same endpoint + params the stock page uses** (captured from `ArrayOperation.page` / `ToggleState.php` / `Boot.php`):

| Action | Endpoint | Params (field=value) |
|---|---|---|
| Pool-state precheck (before encrypted Start) | `POST /webGui/include/Report.php` | `cmd=state`, `pools=<csv>` — non-empty response aborts Start |
| Start array | `POST /update.htm` | `startState=<mdState>`, `cmdStart=Start` (+`startMode=Maintenance`, +`luksKey=base64(passphrase)`, +`luksReformat`, +`md_invalidslot=99` per case) |
| Keyfile upload (before Start) | `POST /update.php` | `#file=unused`, `#include=webGui/include/KeyUpload.php`, `file=<base64 dataURL>` |
| Stop array | `POST /update.htm` | `startState=<mdState>`, `cmdStop=Stop` |
| Format unmountable | `POST /update.htm` | `cmdFormat=Format`, `unmountable_mask=<fsUnmountableMask>`, `confirmFormat` |
| Parity check | `POST /update.htm` | `cmdCheck=Check` (+`optionCorrect=correct` for correcting check) |
| Sync / rebuild | `POST /update.htm` | `cmdCheckSync=Sync` |
| Clear new disk | `POST /update.htm` | `cmdCheckClear=Clear` |
| Pause parity | `POST /webGui/include/ParityControl.php` `{action:'pause'}` then `POST /update.htm cmdCheckPause` |
| Resume parity | `POST /webGui/include/ParityControl.php` `{action:'resume'}` then `POST /update.htm cmdCheckResume` |
| Cancel parity | `POST /update.htm` | `cmdCheckCancel=` |
| Spin up/down (all) | `POST /webGui/include/ToggleState.php` | `device=up` / `device=down` (per-disk: `name=<disk>`; per-pool: `poolName=<pool>`) |
| Clear stats | `POST /webGui/include/ToggleState.php` | `device=Clear` |
| Mover | `POST /update.htm` | `cmdStartMover=Move` (or `Empty` when array-only) |
| Reboot / Shutdown | `POST /webGui/include/Boot.php` | `cmd=reboot` / `cmd=shutdown` (+`safemode`) |
| Encryption keyfile delete | `POST /update.php` | `file=unused`, `include=webGui/include/KeyUpload.php`, `apply=Delete` |

All POSTs include `csrf_token` (sourced from the `data-csrf` attribute on the mount point, set by the `.page` shell from `$var['csrf_token']`). `target=progressFrame` semantics are reproduced by submitting to a hidden iframe (or fetch + reload), matching `update.htm`'s reload-parent behaviour.

### Component tree

```
<modernui-main-page>              Owns store, csrf, nchan subscriptions, visibility lifecycle
├── <md-main-array-card>          "Array Devices" — parity + data disks
│   └── <md-main-device-row>      icon · name(link) · model+serial · orb+state · temp · R · W · err · FS · size · used · free · util-bar
├── <md-main-pool-card>           one per pool (cache, cache_apps, …) with pool status + profile
│   └── <md-main-device-row>
├── <md-main-boot-card>           Flash device (FS usage; link to flash settings/log)
├── <md-main-operation-panel>     Start/Stop array button + status orb + reason text
│   ├── <md-main-encryption-fields>  (Stopped + key needed) status label · input select · passphrase + showPass · retype (reformat) · keyfile upload · permit-reformat · delete-keyfile
│   ├── (maintenance checkbox)    Start variant
│   ├── (confirmStart checkbox)   DISABLE_DISK / RECON_DISK / SWAP_DSBL gate
│   ├── (format)                  Format button + "Yes I want to do this" confirm (when unmountableMask)
│   ├── <md-main-parity-panel>    Check (+correct) / Sync / Clear · Pause/Resume/Cancel · progress bar · last-check summary · History
│   ├── <md-main-spin-controls>   Spin Up all · Spin Down all · Clear Stats · reads/writes toggle
│   └── <md-main-power-panel>     Move/Empty (mover) · Reboot · Shutdown · safe-mode checkbox
└── (per-device detail = link-out to stock /Main/Device?name= ; rebuild deferred)
```

`md-main-device-row` is the heart of the "serials + 1:1" requirement — it renders every `disks.ini` column the stock table shows, plus the model/serial split that stock surfaces in the Identification column.

### Status orb / state mapping (1:1 with stock)

Derived from `disks.ini` `color` + `spundown` + `status`, reproducing `ArrayOperation.page:70 status_indicator()` and `include/DiskList.php:103`:

| Condition | Stock visual | Our orb / label |
|---|---|---|
| `color=green-on`, `spundown=0` | solid green circle, "active" | green orb · "active" |
| `color=green-blink` / `spundown=1` | grey circle, "standby" | grey orb · "standby" |
| `color=yellow-on` | solid yellow, warning | yellow orb · status text |
| `status=DISK_DSBL`/`DISK_NP_DSBL` | red, "disabled" | red orb · "disabled" |
| `status=*_MISSING` | red, "missing" | red orb · "missing" |
| `fsStatus=Unmountable…` | red FS dot | red FS dot · "Unmountable" (+Format affordance) |
| `status=DISK_NEW` | "new device" | grey orb · "new" |
| `status=DISK_NP` (empty slot) | shown only when array Stopped | render slot only in Stopped/assignment view |

### Array Operation state machine (the critical surface)

The Start/Stop button label, enabled flag, gating, and reasons are derived by a **single pure function** `deriveOperation(varIni): OperationState['primary']` that reproduces `ArrayOperation.page`'s nested switch:

1. Outer switch on `fsState`: `Started`→Stop; `Starting/Stopping/Formatting`→disabled spinner label; `Copying/Clearing`→Cancel; `Stopped`→inner logic.
2. `Stopped` inner: if `configValid ∈ {error,invalid,ineligible,nokeyserver,withdrawn}` → Start **disabled** with reason link; else switch on `mdState`: `STARTED/STOPPED/NEW_ARRAY`→Start enabled (NEW_ARRAY may warn parity overwrite); `DISABLE_DISK/RECON_DISK/SWAP_DSBL`→Start gated behind `confirmStart`; `ERROR:*` (INVALID_EXPANSION, NEW_DISK_TOO_SMALL, PARITY_NOT_BIGGEST, TOO_MANY_MISSING_DISKS, NO_DATA_DISKS, NO_DEVICES)→Start **disabled** with explanation.
3. **Encryption (Stopped state only — see dedicated subsection below).** When a luks member needs a key, inject the passphrase/keyfile inputs; Start stays disabled until a valid passphrase (or keyfile) is supplied.
4. `/sub/mymonitor` busy (1/2/3) → disable Stop/Mover/Spin with "Disabled — parity/mover/btrfs running".

### Encrypted-array key entry (Stopped state) — 1:1 with `check_encryption()`

This is a distinct, safety-critical surface that **only appears when `fsState=Stopped`**. It must reproduce `ArrayOperation.page`'s `check_encryption()` + `selectInput()` + `prepareInput()` exactly (see [docs/research/main-page/ArrayOperation.page.txt](../../research/main-page/ArrayOperation.page.txt) lines 19–60, 176–246).

**When the inputs appear** — compute `EncryptionState.mode` from per-disk `luksState` (in `disks.ini`) + `fsType`/`defaultFsType`:
- `enter-new` (`$forced`): a luks or auto-defaults-to-luks disk with no key set → label **"Enter new key"**.
- `missing-key` (`luksState=2`) → label **"Missing key"**.
- `wrong-key` (`luksState=3`) → label **"Wrong key"**; also exposes the **"permit reformat"** (`luksReformat`) checkbox.
- `unlocked`: encrypted but key already known (typically a configured keyfile) → **no inputs**, Start enabled.
- `none`: not encrypted.

**Fields (exact stock names — actions.ts must POST these names):**
- `input` select → `text` (Passphrase) | `file` (Keyfile).
- `text` — `<input type=password maxlength=512>`; with `showPass` checkbox toggling to plaintext.
- `copy` — Retype passphrase; shown **only** when `luksReformat` is checked; Start disabled until `text === copy`.
- `local`/`file` — keyfile `<input type=file>`; read via `FileReader` → base64 data URL into the `file` value.
- `luksReformat` — **"permit reformat"** checkbox. **Data-destructive** (re-encrypts/wipes). Kept for stock parity but **guarded**: default off; never auto-checked; ticking it reveals an inline destructive-action warning; and a Start with `luksReformat` on requires an **explicit second confirmation** (a typed/confirm-dialog acknowledgment) before the POST fires. Without that acknowledgment, Start stays disabled. This is stricter than stock (which submits on the single checkbox) and is intentional — it's the one irreversible action on the page.

**Start flow (prepareInput):**
1. POST `/webGui/include/Report.php {cmd:'state', pools:'<EncryptionState.poolNames csv>'}`. Non-empty response → show "Wrong Pool State" error, abort Start.
2. Append `cmdStart=Start` (+ `startState=<mdState>` already on the form).
3. If a passphrase was entered: validate `^[ -~]+$` (printable ASCII only — else show "Printable Characters Only", abort); append `luksKey=base64(text)`; submit.
4. Else (keyfile): POST `/update.php {#file:'unused', #include:'webGui/include/KeyUpload.php', file:<dataURL>}`, then submit.

**Delete keyfile** — when `keyfilePresent`: a separate form POSTs `/update.php {#file:'unused', #include:'webGui/include/KeyUpload.php', #apply:'Delete'}`.

Because a healthy box rarely exhibits `missing-key`/`wrong-key`/`enter-new` on demand, these are driven by `var-encrypted-*.ini` fixtures and unit-tested in both `deriveOperation()` (which mode + Start gating) and `actions.ts` (luksKey base64, ASCII validation, keyfile upload, Report.php precheck, delete-keyfile params).

Because a healthy box can't exhibit most of these states on demand, this function is **unit-tested against synthetic `var.ini` fixtures**, one per state, captured/authored under `src/ts/main/__fixtures__/var-*.ini`. This is the single most important test surface in the phase.

## Out of scope for v0.6.0

- **Per-device detail/settings page** (`/Main/Device?name=`, `DeviceInfo.page` — 82 KB of SMART attributes, spin-down settings, identity, capabilities). We preserve the click-through to the **stock** detail page (nothing is lost). Rebuild is a future phase.
- **Disk-assignment UI in the Stopped state.** When the array is stopped, stock renders per-slot device-assignment `<select>` dropdowns into the same tables. v0.6.0 renders the device list read-clean in Stopped state and **links out to stock for re-assignment** if needed; full drag/assign is a follow-up. (Start/Stop itself is fully supported.)
- The **SMART context menu** — it is a Dashboard feature (`DashStats.page`), not present on stock `/Main`. No parity to maintain.
- `/Settings/DiskSettings`, `/Tools`, unassigned-devices plugin surfaces.

## Acceptance criteria for v0.6.0

1. `/Main` renders the modern page on fresh install; `?modernui=off` (and Settings → Theme → Main: Stock) fall back to stock instantly.
2. Every device the stock page lists appears in our UI with identical: name, **model + serial**, state/orb, temperature, reads, writes, errors, FS type, size, used, free, utilization — verified field-by-field against `disks.ini` on the test rig.
3. SHA-keyed backups of all **four** `.page` files exist under `/usr/local/emhttp/plugins/unraid-modernui/backups/`; uninstall byte-restores all four; SHA drift on any one triggers safe mode (all four restored, stock renders, banner shown).
4. `deriveOperation()` returns the correct label/enabled/reason for **every** `fsState × mdState × configValid` case, proven by unit tests against the `var-*.ini` fixtures.
5. Start array, Stop array, Spin Up/Down all, Clear Stats, Mover, Parity Check (correcting + read-only), Pause/Resume, Cancel, Reboot, Shutdown each POST the exact endpoint + params captured from stock (verified by a network-capture test on the rig) and produce the same `emhttp` result as the stock button.
6. Live updates: temp/IO/spin changes and array state transitions reflect within one nchan debounce window; no `setTimeout` polling loop.
7. Zero synchronous external HTTP, zero shelling, zero `<script>` creation post-boot (CI grep over `package/include/` + Playwright `document.scripts.length` guard).
8. Hidden-tab pause: backgrounded 60s → no nchan processing (lifecycle counter).
9. **Encrypted-array key entry (Stopped state) is 1:1:** the passphrase/keyfile inputs appear under the same conditions as stock (`enter-new` / `missing-key` / `wrong-key`), stay hidden when unlocked; Start is disabled until a valid printable-ASCII passphrase (or keyfile) is supplied; `luksKey` is base64-encoded; the `Report.php` pool precheck runs; the "permit reformat" checkbox is off by default and carries a data-loss warning; the Delete-keyfile form appears only when a keyfile is configured. Verified by `deriveOperation()` + `actions.ts` unit tests against `var-encrypted-*.ini` fixtures, plus a manual checklist item on an encrypted test array.
10. A new "Main page layout: Modern / Stock" toggle appears in Settings → Theme and gates the takeover via `data-modernui-main`.

## Open questions

- Exact `update.htm` response/redirect behaviour when posting via `fetch` vs the stock hidden `progressFrame` — do we need the iframe, or does `fetch` + manual resync suffice? (Capture on rig.)
- Does `main-state.php` need `$var['csrf_token']` for the **read** (GET), or only the action POSTs? (Stock GET pages don't; confirm.)
- Multi-pool boxes: confirm `pool_status_N` / `pool_deviceN` indexing is contiguous and matches `disks.ini` `type=Cache` grouping by pool leader.
- Whether `/sub/devices` must be subscribed (page `Nchan=` attr preserved) for `emhttp` to keep `disks.ini` fresh, or if `disks.ini` updates regardless. (Affects whether the ArrayOperation overlay must keep the `Nchan=` line — current assumption: keep it.)
- `update.htm` vs `update.php` for array cmds — confirm which the 7.3.1 form actually targets (capture shows `update.htm`; verify params land).

## Implementation note for the planning phase

Before/within the first task, capture these live fixtures from the rig (read-only) under `src/ts/main/__fixtures__/`:
- `disks.ini` full sample (HDD data, parity, NVMe pool leader + members, flash) — already partially captured in [docs/research/main-page/disks.ini.sample.txt](../../research/main-page/disks.ini.sample.txt).
- `var.ini` for the current (Started, healthy) state — [captured](../../research/main-page/var.ini.sample.txt) — plus hand-authored `var-*.ini` variants for each operation state (Stopped, NEW_ARRAY, DISABLE_DISK, parity-running, configValid=invalid, encrypted, formatting).
- One full nchan message from `/sub/devices` and one from `/sub/mymonitor`.
- A network capture of one Start and one Spin-down POST (params + headers).

These are the empirical surface our front-end binds against.
