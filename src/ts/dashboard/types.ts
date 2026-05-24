// All widget state interfaces live here. Each extractor's task adds its own.
// This file is the canonical source for the WidgetState union and the WidgetKind enum.

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

// Per-widget interfaces extend this with kind: '<their-kind>'.
// Added incrementally; see each widget's task.

export type WidgetState = UnknownWidget;
// As widget interfaces are added, this expands to:
// export type WidgetState = UnknownWidget | ArrayState | CacheState | ...
