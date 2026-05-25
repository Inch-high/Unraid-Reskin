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

export interface DiskSlot {
  position: number;            // grid order from style="order:N"
  occupied: boolean;           // inferred from orb color: grey = empty, else occupied
  orbColor: DiskSlotColor;
  label: string;               // slot number text from <b>N</b>
  inlineBgColor: string | null; // The inline background-color of the slot box, if any
}

export interface DisklocationState {
  kind: 'disklocation';
  assignedCount: number;       // "14 of 19 drives assigned" → 14
  totalCount: number;          // → 19
  slots: DiskSlot[];           // single flat list; component groups visually
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
  utilizationPct: number | null;
  memoryUsedPct: number | null;
  memoryMHz: number | null;
  fanRpm: number | null;
  powerW: number | null;
  temperatureC: number | null;
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
