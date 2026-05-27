// All widget state interfaces live here. Each extractor's task adds its own.

export type WidgetKind =
  | 'identity'
  | 'array'
  | 'cache'
  | 'parity'
  | 'disklocation'
  | 'processor'
  | 'system'
  | 'gpu'
  | 'ipmi'
  | 'docker'
  | 'vms'
  | 'interface'
  | 'ups'
  | 'motherboard'
  | 'shares'
  | 'users'
  | 'unknown';

export interface UnknownWidget {
  kind: 'unknown';
  id: string;
  hint: string;
  innerHTML: string;
}

export type DiskState = 'active' | 'standby' | 'spinning-up' | 'unmounted' | 'unknown';
export type SmartHealth = 'healthy' | 'warning' | 'failed' | 'unknown';

export interface DiskRow {
  name: string;
  state: DiskState;
  tempC: number | null;
  smart: SmartHealth;
  utilizationPct: number | null;
}

export interface ArrayState {
  kind: 'array';
  status: 'started' | 'starting' | 'stopped' | 'unknown';
  usedTB: number | null;
  totalTB: number | null;
  disks: DiskRow[];
}

export interface CacheState {
  kind: 'cache';
  poolName: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  usedGB: number | null;
  totalGB: number | null;
  disks: DiskRow[];
}

export type ParityStatus = 'valid' | 'running' | 'invalid' | 'disabled' | 'unknown';

export interface ParityState {
  kind: 'parity';
  status: ParityStatus;
  lastCheckText: string | null;
  durationText: string | null;
  averageSpeedMBs: number | null;
  errorsFound: number | null;
  scheduleEnabled: boolean;
}

export type DiskSlotColor = 'green' | 'yellow' | 'red' | 'blue' | 'grey';

// Per-slot lifecycle state, derived from the disklocation plugin's orb classes:
//   green-orb-disklocation                                 → 'active'  (drive spinning)
//   grey-orb-disklocation + green-blink-disklocation       → 'standby' (drive assigned, spun-down)
//   grey-orb-disklocation alone                            → 'empty'   (no drive present)
export type DiskSlotState = 'active' | 'standby' | 'empty';

export interface DiskSlot {
  position: number;            // grid order from style="order:N"
  occupied: boolean;           // true for both 'active' and 'standby' — empty bays are false
  orbColor: DiskSlotColor;
  state: DiskSlotState;
  diskName: string | null;     // device identifier parsed from the slot's /Main/Device?name=… link (e.g. "disk1", "parity", "cache")
  label: string;               // slot number text from <b>N</b>
  inlineBgColor: string | null; // The inline background-color of the slot box, if any
}

export interface DisklocationGroup {
  /** User-defined group name (from disklocation plugin's groups.json — e.g.
   *  "NVMEs", "HDDs", "Backup pool"). Empty string if the plugin didn't
   *  render a label for this tier. */
  name: string;
  /** Number of columns in the user-defined grid (from groups.json grid_columns;
   *  reflected in the DOM as N `auto` tokens in `grid-template-columns`).
   *  We honor this so an 8×2 layout doesn't render as a single row of 16. */
  columns: number;
  slots: DiskSlot[];
}

export interface DisklocationState {
  kind: 'disklocation';
  assignedCount: number;       // "14 of 19 drives assigned" → 14
  totalCount: number;          // → 19
  // The disklocation plugin emits one .grid-container per physical tier with
  // a user-defined name + column count. Order preserved as in the source DOM
  // so consumers render each tier in the same vertical sequence the user laid
  // them out.
  groups: DisklocationGroup[];
}

export interface CoreLoad {
  index: number;
  threadLabel: string;  // "CPU 0 - HT 16"
  loadPct: number;
}

export interface ProcessorState {
  kind: 'processor';
  model: string;             // "AMD EPYC 8124P 16-Core @ 2450 MHz"
  cores: number;             // parsed from /(\d+)-Core/ in model
  totalPowerW: number | null;
  temperatureC: number | null;
  overallLoadPct: number | null;
  coreLoads: CoreLoad[];
}

export interface MemorySlice {
  label: string;            // "RAM usage", "Boot device", "Log filesystem", "Docker vdisk"
  percentUsed: number;
  detail: string;           // tooltip text "Percent of total used memory (62.6 GiB)"
  used: string;             // human "34.1 GiB" - read from span.varN sibling of span.sysN
  total: string;            // human "126 GiB" - parsed from detail's parenthesised tail
}

export interface MemoryState {
  kind: 'system';
  pies: MemorySlice[];
}

export interface GpuState {
  kind: 'gpu';
  model: string;             // "NVIDIA RTX A2000 12GB"
  vendor: string;            // "NVIDIA"
  driver: string;            // driver version string
  pciBus: string;            // "1 (4) Lanes (Max): 16 (16)" or just the bus identifier
  utilizationPct: number | null;  // gpu-util1: GPU controller activity %
  memoryUsedPct: number | null;   // gpu-memutil1: memory controller activity % (NOT VRAM allocation)
  encoderUtilPct: number | null;  // gpu-encutil1: hardware encoder %
  decoderUtilPct: number | null;  // gpu-decutil1: hardware decoder %
  gpuClockMHz: number | null;     // gpu-clock1: core clock (always non-zero on a powered card)
  memoryMHz: number | null;       // gpu-memclock1: memory clock
  fanRpm: number | null;          // gpu-fan1: fan % (0-100); the "RPM" suffix in the Unraid label is a misnomer
  powerW: number | null;
  temperatureC: number | null;
  perfState: string;              // gpu-perfstate1: "P0".."P12"
  activeApps: number;
  throttling: boolean;
}

export interface IpmiSensor {
  name: string;
  reading: string;
  status: 'green' | 'yellow' | 'red' | 'blue' | 'grey';
  group: 'temperature' | 'fan' | 'voltage' | 'other';
}

export interface IpmiState {
  kind: 'ipmi';
  sensors: IpmiSensor[];
}

export interface DockerContainer {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'unknown';
  imgUrl: string | null;
  folderName: string | null;   // null if not in a folder.view2 grouping
}

export interface DockerFolder {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'mixed';
  containers: DockerContainer[];
  totalCount: number;
  runningCount: number;
}

export interface DockerState {
  kind: 'docker';
  folders: DockerFolder[];      // populated when folder.view2 is installed
  ungrouped: DockerContainer[]; // containers not in any folder
  totalRunning: number;
  totalCount: number;
  /** True when the docker tbody is on the page but dynamix.docker.manager has
   *  not injected `.outer.solid.apps` tiles yet. Lets the hero strip render a
   *  skeleton placeholder instead of popping the card in late.
   *
   *  Lifecycle: there's no explicit clear — the next extractAll() pass sees
   *  the real tiles, recomputes loading=false, and the store replaces the
   *  prior state. The MutationObserver fires that next pass as soon as
   *  dynamix.docker.manager injects the first `.outer.solid.apps`. */
  loading?: boolean;
}

// VMs widget. The cold tbody is empty (data="noVMs()"); libvirt.json
// populates VM tiles client-side as <span.outer.solid.vms.{state}>.
export interface VmRow {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'unknown';
  iconUrl: string | null;
}

export interface VmsState {
  kind: 'vms';
  vms: VmRow[];
  totalRunning: number;
  totalCount: number;
  /** True when the vm_view tbody is on the page but libvirt.json has not
   *  injected `.outer.solid.vms` tiles yet.
   *
   *  Lifecycle: never explicitly cleared. The next extract pass (triggered by
   *  the MutationObserver or the 5s safety-net) recomputes loading=false once
   *  real tiles appear, and the store replaces the prior state. */
  loading?: boolean;
}

// Network interface widget. The header has a <select name="port_select">
// listing interfaces; per-row data is injected into ids like #main0, #port0,
// #link0 by JS. We surface the list + currently-selected interface.
export interface NetworkInterface {
  name: string;          // "bond0", "eth0", "eth1", "lo"
  mainText: string;      // contents of #mainN once populated (mode/speed/duplex)
}

export interface InterfaceState {
  kind: 'interface';
  interfaces: NetworkInterface[];
  selectedName: string;
  inboundText: string;   // contents of #inbound (e.g. "237.1 Kbps")
  outboundText: string;
}

// UPS widget. The cold tbody shows placeholder spinners; live values appear
// in spans with class names like .nut_bcharge, .nut_timeleft, .nut_loadpct.
export type UpsStatus = 'on-line' | 'on-battery' | 'low-battery' | 'replace-battery' | 'unknown';

export interface UpsState {
  kind: 'ups';
  status: UpsStatus;
  statusText: string;        // raw text from .nut_status
  batteryChargePct: number | null;
  loadPct: number | null;
  loadW: number | null;       // computed (loadPct% * nominalPowerW)
  runtimeMinutes: number | null;
  nominalPowerW: number | null;
  nominalVA: number | null;
  /** True when the UPS tbody is on the page but apcupsd-status/nut JS has not
   *  replaced the spinner placeholders yet. Distinguishes "still loading" from
   *  "actually unknown" so the Power hero card can show a skeleton.
   *
   *  Lifecycle: never explicitly cleared. The next extract pass recomputes
   *  loading=false once spinners go away. In Unraid 7.3, that's typically the
   *  5s safety-net tick (since the legacy tbody also stops receiving live
   *  characterData mutations once the modern <footer> takes over). */
  loading?: boolean;
}

// Identity widget — the HL15Rack-style tbody with class='system'. Header shows
// server name, description, time. Body shows model, registration, uptime, case icon.
export interface IdentityState {
  kind: 'identity';
  serverName: string;        // "HL15Rack"
  description: string;       // "Media server"
  model: string;             // "Custom"
  registration: string;      // "Unraid OS Pro"
  uptimeText: string;        // populated client-side from .uptime
  caseClass: string | null;  // e.g. "case-45Drives-HL15" — for icon rendering
}

// Motherboard widget — three plain-text lines after the header.
export interface MotherboardState {
  kind: 'motherboard';
  vendor: string;            // "Giga Computing ME03-CE0-000 , Version 01000100"
  biosVendor: string;        // "GIGABYTE, Version F12"
  biosDated: string;         // "Sun 12 Apr 2026 12:00 AM"
}

// Shares widget — list of shares with name, description, security, stream count.
export type ShareSecurity = 'public' | 'private' | 'secure' | 'hidden';

export interface ShareRow {
  name: string;
  description: string;
  security: ShareSecurity;
  streams: number | null;    // null when the count span is empty
}

export interface SharesState {
  kind: 'shares';
  shares: ShareRow[];
  totalCount: number;        // parsed from header "Share count: 10 with..."
  publicSmbCount: number;
  publicNfsCount: number;
}

// Users widget — list of users with description, write/read counts.
export interface UserRow {
  name: string;
  description: string;
  writeCount: number | null;
  readCount: number | null;
}

export interface UsersState {
  kind: 'users';
  users: UserRow[];
  totalCount: number;
  unprotectedCount: number;
}

export type WidgetState =
  | UnknownWidget
  | ArrayState
  | CacheState
  | ParityState
  | DisklocationState
  | ProcessorState
  | MemoryState
  | GpuState
  | IpmiState
  | DockerState
  | VmsState
  | InterfaceState
  | UpsState
  | IdentityState
  | MotherboardState
  | SharesState
  | UsersState;
