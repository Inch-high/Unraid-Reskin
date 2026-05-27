import type {
  DockerPageState,
  DockerContainerFull,
  DockerDelta,
  DockerFilters,
  DockerFolder,
  DockerTag,
} from './types';

// Reactive store for the docker page. Single source of truth; components
// subscribe and re-render on change. Same shape as the dashboard store
// (src/ts/dashboard/store.ts) but typed to a single page state instead of a
// per-widget Map.

type Listener = () => void;

const EMPTY_STATE: DockerPageState = {
  containers: [],
  folders: [],
  tags: [],
  tagAssignments: {},
};

const DEFAULT_FILTERS: DockerFilters = {
  query: '',
  state: 'all',
  folderId: null,
  tagIds: [],
};

// Per-folder collapsed state. Persisted to localStorage so user toggles
// survive page reloads. Default ('expanded' or 'collapsed') is set from the
// data-modernui-docker-folder-default attribute on <html> (which comes from
// Settings → Theme). The "Ungrouped" folder uses the literal key 'ungrouped'.
const COLLAPSE_STORAGE_KEY = 'modernui-docker-collapsed';

function loadCollapsedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch { /* corrupt key — discard */ }
  return new Set();
}

function saveCollapsedToStorage(s: Set<string>): void {
  try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...s])); } catch { /* quota */ }
}

export interface DockerStore {
  getState(): DockerPageState;
  getFilters(): DockerFilters;
  getSelection(): Set<string>;
  /** Returns true if this folder is currently collapsed in the UI. */
  isCollapsed(folderId: string): boolean;
  /** Lit components use this to know whether they should be collapsed. */
  getCollapseDefault(): 'expanded' | 'collapsed';
  /** Whether the Show Stats toggle is on — controls the per-row stats line and collapsed-folder sums. */
  getShowStats(): boolean;

  setState(state: DockerPageState): void;
  applyDelta(delta: DockerDelta): void;
  setFilters(patch: Partial<DockerFilters>): void;
  toggleSelection(name: string): void;
  clearSelection(): void;
  setFolders(folders: DockerFolder[]): void;
  setTags(tags: DockerTag[], assignments: Record<string, string[]>): void;
  /** Toggle a folder's collapsed state and persist. Pass 'ungrouped' for the Ungrouped section. */
  toggleCollapsed(folderId: string): void;
  setCollapseDefault(d: 'expanded' | 'collapsed'): void;
  setShowStats(on: boolean): void;

  subscribe(fn: Listener): () => void;
}

export function createDockerStore(): DockerStore {
  let state: DockerPageState = EMPTY_STATE;
  let filters: DockerFilters = DEFAULT_FILTERS;
  let selection: Set<string> = new Set();
  // Tracks folders the user has EXPLICITLY toggled. If a folder is in this set,
  // its collapsed value flips the default. This lets the default setting flow
  // through to folders the user hasn't touched, while preserving per-folder
  // overrides — the standard "default + override" pattern.
  let explicitToggles: Set<string> = loadCollapsedFromStorage();
  let collapseDefault: 'expanded' | 'collapsed' = 'expanded';
  let showStats = false;
  const listeners = new Set<Listener>();

  const notify = (): void => {
    for (const l of listeners) l();
  };

  return {
    getState: () => state,
    getFilters: () => filters,
    getSelection: () => selection,
    getCollapseDefault: () => collapseDefault,
    getShowStats: () => showStats,
    isCollapsed(folderId) {
      const isInToggles = explicitToggles.has(folderId);
      // explicit toggle FLIPS the default. So:
      //  default=expanded, no toggle  → expanded
      //  default=expanded, with toggle → collapsed
      //  default=collapsed, no toggle → collapsed
      //  default=collapsed, with toggle → expanded
      const defaultCollapsed = collapseDefault === 'collapsed';
      return isInToggles ? !defaultCollapsed : defaultCollapsed;
    },

    setState(next) {
      state = next;
      // Drop selection entries for containers that no longer exist
      const live = new Set(next.containers.map((c) => c.name));
      let changed = false;
      for (const name of selection) {
        if (!live.has(name)) {
          selection.delete(name);
          changed = true;
        }
      }
      if (changed) selection = new Set(selection);
      notify();
    },

    applyDelta(delta) {
      const idx = state.containers.findIndex((c) => c.name === delta.name);
      if (idx === -1) return;
      const before = state.containers[idx];
      const after: DockerContainerFull = {
        ...before,
        state: delta.state ?? before.state,
        cpuPct: delta.cpuPct ?? before.cpuPct,
        memBytes: delta.memBytes ?? before.memBytes,
        uptime: delta.uptime ?? before.uptime,
        updateAvailable: delta.updateAvailable ?? before.updateAvailable,
      };
      // Skip notify if nothing actually changed
      if (
        after.state === before.state &&
        after.cpuPct === before.cpuPct &&
        after.memBytes === before.memBytes &&
        after.uptime === before.uptime &&
        after.updateAvailable === before.updateAvailable
      ) return;
      state = {
        ...state,
        containers: [
          ...state.containers.slice(0, idx),
          after,
          ...state.containers.slice(idx + 1),
        ],
      };
      notify();
    },

    setFilters(patch) {
      filters = { ...filters, ...patch };
      notify();
    },

    toggleSelection(name) {
      const next = new Set(selection);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      selection = next;
      notify();
    },

    clearSelection() {
      if (selection.size === 0) return;
      selection = new Set();
      notify();
    },

    setFolders(folders) {
      state = { ...state, folders };
      notify();
    },

    setTags(tags, assignments) {
      state = { ...state, tags, tagAssignments: assignments };
      notify();
    },

    toggleCollapsed(folderId) {
      const next = new Set(explicitToggles);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      explicitToggles = next;
      saveCollapsedToStorage(explicitToggles);
      notify();
    },

    setCollapseDefault(d) {
      if (collapseDefault === d) return;
      collapseDefault = d;
      notify();
    },

    setShowStats(on) {
      if (showStats === on) return;
      showStats = on;
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn) as unknown as void;
    },
  };
}

// =========================================================================
// Filter pipeline — pure, testable. Called from md-docker-page render().
// =========================================================================

export interface GroupedContainers {
  folderId: string | null;   // null for "Ungrouped"
  folder: DockerFolder | null;
  containers: DockerContainerFull[];
}

export function filterContainers(
  state: DockerPageState,
  filters: DockerFilters,
): DockerContainerFull[] {
  const q = filters.query.trim().toLowerCase();
  return state.containers.filter((c) => {
    if (filters.state === 'running' && c.state !== 'started') return false;
    if (filters.state === 'stopped' && c.state === 'started') return false;
    if (filters.tagIds.length > 0) {
      const assigned = state.tagAssignments[c.name] ?? [];
      for (const t of filters.tagIds) if (!assigned.includes(t)) return false;
    }
    if (filters.folderId !== null) {
      const folder = state.folders.find((f) => f.id === filters.folderId);
      if (!folder) return false;
      if (!folder.containerNames.includes(c.name)) return false;
    }
    if (q) {
      const tagNames = (state.tagAssignments[c.name] ?? [])
        .map((id) => state.tags.find((t) => t.id === id)?.name ?? '')
        .join(' ');
      const folderName = state.folders.find((f) => f.containerNames.includes(c.name))?.name ?? '';
      const portsText = c.ports.map((p) => `${p.hostPort} ${p.containerPort}`).join(' ');
      const haystack = [c.name, c.image, tagNames, folderName, portsText].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function groupContainers(
  containers: DockerContainerFull[],
  folders: DockerFolder[],
): GroupedContainers[] {
  const byName = new Map<string, DockerContainerFull>();
  for (const c of containers) byName.set(c.name, c);

  const groups: GroupedContainers[] = [];
  const assignedNames = new Set<string>();

  for (const folder of folders) {
    const inFolder: DockerContainerFull[] = [];
    for (const name of folder.containerNames) {
      const c = byName.get(name);
      if (c) {
        inFolder.push(c);
        assignedNames.add(name);
      }
    }
    if (inFolder.length === 0) continue;  // hide empty folders post-filter
    groups.push({ folderId: folder.id, folder, containers: inFolder });
  }

  const ungrouped = containers.filter((c) => !assignedNames.has(c.name));
  if (ungrouped.length > 0) {
    groups.push({ folderId: null, folder: null, containers: ungrouped });
  }
  return groups;
}

// =========================================================================
// URL <-> filter sync. Bookmarkable filtered views.
// =========================================================================

export function filtersToQuery(f: DockerFilters): string {
  const params = new URLSearchParams();
  if (f.query) params.set('q', f.query);
  if (f.state !== 'all') params.set('state', f.state);
  if (f.folderId) params.set('folder', f.folderId);
  if (f.tagIds.length > 0) params.set('tags', f.tagIds.join(','));
  const s = params.toString();
  return s ? '?' + s : '';
}

export function filtersFromQuery(search: string): DockerFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const stateRaw = params.get('state');
  const state: DockerFilters['state'] =
    stateRaw === 'running' || stateRaw === 'stopped' ? stateRaw : 'all';
  return {
    query: params.get('q') ?? '',
    state,
    folderId: params.get('folder'),
    tagIds: (params.get('tags') ?? '').split(',').filter(Boolean),
  };
}
