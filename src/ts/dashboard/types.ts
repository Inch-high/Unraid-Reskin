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

export type WidgetState = UnknownWidget | ArrayState | CacheState;
