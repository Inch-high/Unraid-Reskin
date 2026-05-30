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
  /** True until the first setState() resolves. Lets the page render a skeleton
   *  instead of the "No containers" empty state during the initial fetch window. */
  isLoading(): boolean;
  /** Live set of containers currently being updated (image pull + recreate in flight). */
  getUpdating(): Set<string>;
  /** Live set of containers we've optimistically marked as "starting".
   *  Cleared automatically on the next snapshot that confirms the real state. */
  getStarting(): Set<string>;

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
  /** Set every folder to the given collapsed state — i.e. treat the toolbar's
   *  Expanded/Collapsed segmented control as "expand all / collapse all". Sets
   *  the default AND clears per-folder explicit toggles; without the clear,
   *  manually-flipped folders would read as the OPPOSITE of the new default
   *  (because explicit toggles flip the default in isCollapsed()). */
  setCollapseAll(d: 'expanded' | 'collapsed'): void;
  setShowStats(on: boolean): void;
  /** Flag one or more containers as "update in flight". Snapshot completion is
   *  auto-detected on the next setState() — see UpdateProbe. Idempotent. */
  markUpdating(names: string[]): void;
  /** Explicit clear — e.g. after the bulk-update timeout fires. */
  clearUpdating(name: string): void;
  /** Force-clear every updating probe. Triggered when the nchan `/sub/docker`
   *  stream emits `_DONE_`: the script has finished its batch, regardless of
   *  whether DockerUpdate's digest cache has flushed yet. Without this the
   *  panel could sit on "Working…" for the full 5-min watchdog when the
   *  digest write lags reconcile detection. */
  clearAllUpdating(): void;
  /** Optimistically mark containers as "starting" — for the brief window between
   *  user action and the next snapshot. Auto-cleared by reconcileStarting() once
   *  the snapshot confirms started/paused, or watchdog after STARTING_TIMEOUT_MS. */
  markStarting(names: string[]): void;
  /** Explicit clear — e.g. on action failure. */
  clearStarting(name: string): void;

  subscribe(fn: Listener): () => void;
}

// Per-name probe captured at markStarting(). The starting probe is simpler than
// the updating one — we just track when we set it and clear on the next snapshot
// that shows started/paused, or after the watchdog elapses. The watchdog is
// generous (10 min) because boot-time autostart runs sequentially and each
// entry can WAIT up to 60s — a 5+ container chain with 30s waits already
// exceeds 90s, so we err well on the high side. Watchdog only kicks in for
// genuinely stuck transitions; the snapshot poll clears probes much sooner in
// the happy path.
interface StartingProbe { startedAt: number; }
const STARTING_TIMEOUT_MS = 10 * 60_000;

// Per-name baseline captured at markUpdating(). Used by setState() to decide
// when an in-flight update has completed: container's docker id changes when
// it's recreated, and updateAvailable flips from true→false once the new image
// is in place. Either signal clears the entry. The startedAt timestamp drives
// the hard 5-min watchdog so a stalled pull (or a snapshot endpoint that never
// reports the change) doesn't leave the row spinning forever.
interface UpdateProbe {
  startedAt: number;
  prevId: string;
  prevUpdateAvailable: boolean;
}
const UPDATE_TIMEOUT_MS = 5 * 60_000;

// Persist active updating probes across reloads. update_container runs as a
// detached PHP CLI worker on the server (minutes-long for some images), so
// refreshing the page or navigating away mid-update used to wipe the
// "Updating…" UI even though the work continued server-side. We save the
// probe map to localStorage and reload it in createDockerStore() so the next
// page load picks the state back up; reconcileUpdating() then handles
// completion detection on the next snapshot (or the 5-min watchdog clears
// anything truly stale).
const UPDATING_STORAGE_KEY = 'modernui-docker-updating';

function loadUpdatingFromStorage(): Map<string, UpdateProbe> {
  try {
    const raw = localStorage.getItem(UPDATING_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Map();
    const now = Date.now();
    const out = new Map<string, UpdateProbe>();
    for (const [name, p] of Object.entries(parsed as Record<string, unknown>)) {
      if (!p || typeof p !== 'object') continue;
      const probe = p as Partial<UpdateProbe>;
      const startedAt = typeof probe.startedAt === 'number' ? probe.startedAt : 0;
      // Drop probes already past the watchdog window — saves carrying obvious
      // zombies into the new session just to immediately discard them.
      if (now - startedAt > UPDATE_TIMEOUT_MS) continue;
      out.set(name, {
        startedAt,
        prevId: typeof probe.prevId === 'string' ? probe.prevId : '',
        prevUpdateAvailable: probe.prevUpdateAvailable === true,
      });
    }
    return out;
  } catch { return new Map(); }
}

function saveUpdatingToStorage(probes: Map<string, UpdateProbe>): void {
  try {
    if (probes.size === 0) {
      localStorage.removeItem(UPDATING_STORAGE_KEY);
      return;
    }
    const obj: Record<string, UpdateProbe> = {};
    for (const [k, v] of probes) obj[k] = v;
    localStorage.setItem(UPDATING_STORAGE_KEY, JSON.stringify(obj));
  } catch { /* quota — silent best-effort */ }
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
  let loading = true;
  // Updating probes hydrate from localStorage so a refresh mid-update preserves
  // the "Updating…" UI. The Set is rebuilt from the same source so getUpdating()
  // matches updateProbes' keys exactly.
  const updateProbes = loadUpdatingFromStorage();
  let updating: Set<string> = new Set(updateProbes.keys());
  // Starting probes are NOT persisted: they're meaningful only for the brief
  // window after a user action and would be misleading if restored after a
  // page reload (the action either succeeded or not by then).
  const startingProbes = new Map<string, StartingProbe>();
  let starting: Set<string> = new Set();
  const listeners = new Set<Listener>();

  const notify = (): void => {
    for (const l of listeners) l();
  };

  // Walk every in-flight update probe against the latest snapshot. Any probe
  // whose container has been recreated (id change), whose updateAvailable flag
  // has flipped true→false, whose container has vanished, or whose timeout has
  // elapsed, is cleared. Mutates `updating` in place; caller must already be
  // committed to a notify() since callers always notify after a state change.
  const reconcileUpdating = (next: DockerPageState): boolean => {
    if (updateProbes.size === 0) return false;
    const now = Date.now();
    let changed = false;
    for (const [name, probe] of [...updateProbes]) {
      const c = next.containers.find((x) => x.name === name);
      const done =
        !c ||
        (probe.prevId !== '' && c.id !== '' && c.id !== probe.prevId) ||
        (probe.prevUpdateAvailable && !c.updateAvailable) ||
        now - probe.startedAt > UPDATE_TIMEOUT_MS;
      if (done) {
        updateProbes.delete(name);
        updating.delete(name);
        changed = true;
      }
    }
    if (changed) {
      updating = new Set(updating);
      saveUpdatingToStorage(updateProbes);
    }
    return changed;
  };

  // Drop "starting" entries whose container now reports started/paused (success)
  // or which have timed out. We deliberately do NOT clear on a still-stopped
  // result, because the user could be looking at a slow startup (e.g. db
  // containers running migrations) where the server reports `stopped` for many
  // seconds before flipping. The watchdog is the safety net there.
  const reconcileStarting = (next: DockerPageState): boolean => {
    if (startingProbes.size === 0) return false;
    const now = Date.now();
    let changed = false;
    for (const [name, probe] of [...startingProbes]) {
      const c = next.containers.find((x) => x.name === name);
      const elapsed = now - probe.startedAt;
      const done =
        !c ||
        c.state === 'started' || c.state === 'paused' ||
        elapsed > STARTING_TIMEOUT_MS;
      if (done) {
        startingProbes.delete(name);
        starting.delete(name);
        changed = true;
      }
    }
    if (changed) starting = new Set(starting);
    return changed;
  };

  return {
    getState: () => state,
    getFilters: () => filters,
    getSelection: () => selection,
    getCollapseDefault: () => collapseDefault,
    getShowStats: () => showStats,
    isLoading: () => loading,
    getUpdating: () => updating,
    getStarting: () => starting,
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
      loading = false;
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
      reconcileUpdating(next);
      reconcileStarting(next);
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

    setCollapseAll(d) {
      // Clear explicit toggles so the new default applies uniformly. Without
      // this, a folder the user manually collapsed (now in explicitToggles)
      // would flip to expanded when they click "Collapse all" — the opposite
      // of their intent. Persists the cleared toggle set to localStorage so a
      // refresh doesn't bring the overrides back.
      let changed = false;
      if (collapseDefault !== d) {
        collapseDefault = d;
        changed = true;
      }
      if (explicitToggles.size > 0) {
        explicitToggles = new Set();
        saveCollapsedToStorage(explicitToggles);
        changed = true;
      }
      if (changed) notify();
    },

    setShowStats(on) {
      if (showStats === on) return;
      showStats = on;
      notify();
    },

    markUpdating(names) {
      let changed = false;
      const now = Date.now();
      for (const name of names) {
        if (updateProbes.has(name)) continue;
        const c = state.containers.find((x) => x.name === name);
        // No matching container yet (e.g. first snapshot still pending) — still
        // mark, but with an empty prevId so we only fall back on the
        // updateAvailable→false signal or the timeout.
        updateProbes.set(name, {
          startedAt: now,
          prevId: c?.id ?? '',
          prevUpdateAvailable: c?.updateAvailable ?? true,
        });
        if (!updating.has(name)) {
          updating.add(name);
          changed = true;
        }
      }
      if (changed) {
        updating = new Set(updating);
        saveUpdatingToStorage(updateProbes);
        notify();
      }
    },

    clearUpdating(name) {
      if (!updateProbes.has(name) && !updating.has(name)) return;
      updateProbes.delete(name);
      if (updating.has(name)) {
        updating.delete(name);
        updating = new Set(updating);
      }
      saveUpdatingToStorage(updateProbes);
      notify();
    },

    clearAllUpdating() {
      if (updateProbes.size === 0 && updating.size === 0) return;
      updateProbes.clear();
      updating = new Set();
      saveUpdatingToStorage(updateProbes);
      notify();
    },

    markStarting(names) {
      let changed = false;
      const now = Date.now();
      for (const name of names) {
        if (startingProbes.has(name)) continue;
        startingProbes.set(name, { startedAt: now });
        if (!starting.has(name)) {
          starting.add(name);
          changed = true;
        }
      }
      if (changed) {
        starting = new Set(starting);
        notify();
      }
    },

    clearStarting(name) {
      if (!startingProbes.has(name) && !starting.has(name)) return;
      startingProbes.delete(name);
      if (starting.has(name)) {
        starting.delete(name);
        starting = new Set(starting);
      }
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
