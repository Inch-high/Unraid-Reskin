// Main page state — typed shape for the array/device-management screen.
//
// All data originates from /var/local/emhttp/disks.ini (per-device) and
// var.ini (array/parity state machine), parsed by our read-only main-state.php.
// Every state-changing action reuses Unraid's stock endpoints (see actions.ts);
// emhttp does the work. We own only the rendering + client-side derivation.
//
// Field references below cite disks.ini / var.ini keys (see __fixtures__/).

export type DeviceRole = 'parity' | 'data' | 'pool' | 'flash';
export type DeviceSpin = 'active' | 'standby';            // from disks.ini `spundown` (0/1)
export type SmartHealth = 'healthy' | 'warning' | 'failed' | 'unknown';
export type OrbColor = 'green' | 'grey' | 'yellow' | 'red';

// Mirrors disks.ini `status` (+ fsStatus). Drives the orb + label 1:1 with stock.
export type DeviceStatus =
  | 'ok'            // DISK_OK
  | 'new'           // DISK_NEW
  | 'invalid'       // DISK_INVALID
  | 'wrong'         // DISK_WRONG
  | 'disabled'      // DISK_DSBL / DISK_NP_DSBL
  | 'missing'       // *_MISSING
  | 'unmountable'   // fsStatus = "Unmountable…"
  | 'notpresent';   // DISK_NP (empty slot — listed only when array Stopped)

export interface MainDevice {
  name: string;            // disks.ini `name`  (parity, parity2, disk1…, cache…, flash)
  role: DeviceRole;        // from `type`
  linuxDevice: string;     // `device`  (sdX / nvmeXn1)
  model: string;           // `id` before the last '_'
  serial: string;          // `id` after the last '_'      ← user-requested 1:1 field
  status: DeviceStatus;
  spin: DeviceSpin;
  spunDown: boolean;       // `spundown` === '1'
  tempC: number | null;    // `temp` ('*' / spun-down → null)
  numReads: number | null;
  numWrites: number | null;
  numErrors: number | null;
  fsType: string | null;   // `fsType` (luks:xfs, luks:zfs, vfat, …); null for parity
  encrypted: boolean;      // fsType starts with 'luks:'
  luksState: number | null;// disks.ini `luksState` (0 none/new, 1 unlocked, 2 missing, 3 wrong)
  sizeBytes: number | null;        // `size` ×1024 (raw device size; disks.ini is 1K units)
  fsSizeBytes: number | null;      // `fsSize`
  fsUsedBytes: number | null;      // `fsUsed`
  fsFreeBytes: number | null;      // `fsFree`
  utilizationPct: number | null;   // fsUsed / fsSize ×100
  color: string;           // raw `color` token (green-on / green-blink / yellow-on / …)
  orb: OrbColor;           // derived from color (+ spundown)
  smart: SmartHealth;      // derived from `warning`/`critical`/numErrors
  detailHref: string;      // /Main/Device?name=<name>   (link-out to stock detail page)
}

export type PoolStatus = 'online' | 'offline' | 'degraded' | 'unknown';

export interface MainPool {
  id: string;                   // pool leader name (e.g. 'cache')
  label: string;
  status: PoolStatus;           // from pool_status_N span text
  statusText: string;           // raw text ('ONLINE' | 'OFFLINE' | 'DEGRADED')
  fsType: string | null;
  fsProfile: string | null;     // raidz1, raid1, …
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  utilizationPct: number | null;
  devices: MainDevice[];
}

export type ParityAction = 'check' | 'recon' | 'clear' | null;

export interface ParityLastCheck {
  date: string;          // human date from sbSynced/sbSynced2
  durationText: string;
  speed: string;
  errors: number;
}

export interface ParityState {
  action: ParityAction;      // parsed from var.ini mdResyncAction
  correcting: boolean;       // mdResyncCorr indicates a correcting check
  running: boolean;          // mdResync > 0
  paused: boolean;
  posBytes: number | null;   // mdResyncPos
  sizeBytes: number | null;  // mdResyncSize
  pct: number | null;        // posBytes / sizeBytes ×100
  speed: string | null;      // computed from mdResyncDb / mdResyncDt
  errors: number | null;     // sbSyncErrs
  corrected: number | null;  // mdResyncCorr
  last: ParityLastCheck | null;
  scheduleEnabled: boolean;
}

// Encrypted-array key entry. Surfaced ONLY when fsState=Stopped AND a luks
// member needs a key. Reproduces check_encryption() / prepareInput() in
// ArrayOperation.page. Getting this wrong can fail to unlock or — with
// luksReformat — destroy data, so it is its own unit-tested surface.
export type EncryptionMode =
  | 'enter-new'   // $forced: luks/auto member, no key set → "Enter new key"
  | 'missing-key' // luksState=2 → "Missing key"
  | 'wrong-key'   // luksState=3 → "Wrong key" (offers guarded "permit reformat")
  | 'unlocked'    // key already known (e.g. keyfile present) — NO inputs, Start enabled
  | 'none';       // array not encrypted

export interface EncryptionState {
  required: boolean;          // $encrypt — any luks/auto member present
  mode: EncryptionMode;
  keyfilePresent: boolean;    // file_exists(var.luksKeyfile) → show "Delete keyfile"
  allowReformat: boolean;     // user ticked luksReformat — DANGER: re-encrypt/wipe
  poolNames: string[];        // validated via Report.php before an encrypted Start
}

export type FsState =
  | 'Started' | 'Stopped' | 'Starting' | 'Stopping'
  | 'Formatting' | 'Copying' | 'Clearing' | string;

export type PrimaryLabel = 'Start' | 'Stop' | 'Starting…' | 'Stopping…' | 'Formatting…' | 'Cancel';

// The derived button/gating verdict — the heart of 1:1 fidelity. Produced by
// deriveOperation() purely from var.ini (+ encryption from disks.ini).
export interface PrimaryControl {
  label: PrimaryLabel;
  enabled: boolean;
  reason: string | null;          // why disabled / what confirmation is needed
  requiresConfirm: boolean;       // DISABLE_DISK / RECON_DISK / SWAP_DSBL → confirmStart
  requiresMaintenanceField: boolean;
}

export interface OperationState {
  fsState: FsState;          // var.ini fsState
  mdState: string;           // STARTED | STOPPED | NEW_ARRAY | DISABLE_DISK | RECON_DISK | SWAP_DSBL | ERROR:* …
  mdColor: string;           // status orb beside the label
  protected: boolean;
  configValid: string;       // yes | error | invalid | ineligible | nokeyserver | withdrawn
  startMode: string;         // Normal | Maintenance
  counts: { disks: number; disabled: number; invalid: number; missing: number; new: number };
  unmountableMask: string;   // fsUnmountableMask → enables Format
  encryption: EncryptionState;
  // Derived/live — NOT in the main-state.php JSON. `primary` is produced by
  // deriveOperation() (the single source of truth, Task 7); `busy` is set by
  // the store from /sub/mymonitor. Optional so the raw snapshot type-checks.
  primary?: PrimaryControl;
  busy?: 0 | 1 | 2 | 3;      // /sub/mymonitor — 0 idle, 1 parity, 2 mover, 3 btrfs
  moverEnabled: boolean;     // shareUser === 'e'
}

export interface MainArray {
  devices: MainDevice[];     // parity + data disks
  sizeBytes: number | null;  // total array data size
  usedBytes: number | null;
  freeBytes: number | null;
  utilizationPct: number | null;
}

export interface MainPageState {
  array: MainArray;
  pools: MainPool[];
  boot: MainDevice | null;
  parity: ParityState;
  operation: OperationState;
  serverVersion: string;     // var.ini version
  csrfToken: string;         // for action POSTs (from #modernui-main-root data-csrf)
}

// ---- Unassigned Devices (optional plugin; fetched separately via ud-state.php) ----
// Credential-stripped by the PHP wrapper — no passwords/commands ever reach here.

export interface UnassignedPartition {
  device: string;            // e.g. sdz1 — identifier for mount/umount
  mountpoint: string;
  fsType: string;
  label: string;
  mounted: boolean;
  passThrough: boolean;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
}

export interface UnassignedDisk {
  device: string;            // sdz
  serial: string;
  model: string;
  sizeBytes: number | null;
  tempC: number | null;
  partitions: UnassignedPartition[];
}

export interface UnassignedRemote {
  protocol: string;          // smb | nfs | root (iso)
  name: string;
  ip: string;
  share: string;
  mountpoint: string;
  fsType: string;
  device: string;            // identifier for mount/umount
  mounted: boolean;
  alive: boolean;
  readOnly: boolean;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
}

// A previously-seen device the plugin remembers (in its config) but which is
// not currently attached.
export interface UnassignedHistorical {
  serial: string;
  device: string;            // remembered device name (or 'none')
  mountpoint: string;        // last mount point (basename)
  standby: boolean;          // by-id symlink present → spun down vs fully offline
}

export interface UnassignedState {
  available: boolean;        // plugin present AND our suppression overlay active
  disks: UnassignedDisk[];
  remotes: UnassignedRemote[];
  historical: UnassignedHistorical[];
}
