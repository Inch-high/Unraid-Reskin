import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDockerStore,
  filterContainers,
  groupContainers,
  filtersToQuery,
  filtersFromQuery,
} from '../../../src/ts/docker/store';
import type { DockerContainerFull, DockerPageState } from '../../../src/ts/docker/types';

const mkContainer = (overrides: Partial<DockerContainerFull> = {}): DockerContainerFull => ({
  name: 'foo',
  id: 'abc123',
  image: 'lib/foo:latest',
  state: 'started',
  autostart: false,
  uptime: '1h',
  cpuPct: null,
  memBytes: null,
  vdiskBytes: null,
  macAddress: null,
  webuiUrl: null,
  iconUrl: '/x.png',
  ports: [],
  updateAvailable: false,
  templatePath: '',
  shell: 'sh',
  ...overrides,
});

const sampleState = (): DockerPageState => ({
  containers: [
    mkContainer({
      name: 'plex',
      image: 'lib/plex:latest',
      state: 'started',
      ports: [{ host: '192.0.2.1', hostPort: '32400', containerPort: '32400', proto: 'tcp' }],
    }),
    mkContainer({ name: 'sonarr', image: 'lib/sonarr:latest', state: 'started' }),
    mkContainer({ name: 'radarr', image: 'lib/radarr:latest', state: 'stopped' }),
    mkContainer({ name: 'homepage', image: 'lib/homepage:latest', state: 'started' }),
  ],
  folders: [
    {
      id: 'f-media',
      name: 'Media',
      icon: 'film',
      color: '#ff8c2f',
      containerNames: ['plex', 'sonarr', 'radarr'],
    },
  ],
  tags: [
    { id: 't-gpu', name: 'gpu', color: '#22c55e' },
    { id: 't-vpn', name: 'vpn', color: '#3b82f6' },
  ],
  tagAssignments: {
    plex: ['t-gpu'],
    sonarr: ['t-gpu', 't-vpn'],
  },
});

describe('DockerStore — basics', () => {
  it('starts empty and emits on setState', () => {
    const store = createDockerStore();
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    expect(store.getState().containers).toEqual([]);
    store.setState(sampleState());
    expect(calls).toBe(1);
    expect(store.getState().containers.length).toBe(4);
  });

  it('isLoading is true until first setState, then false', () => {
    // Lets the page render a skeleton during the initial fetch window instead
    // of the misleading "No containers" empty state.
    const store = createDockerStore();
    expect(store.isLoading()).toBe(true);
    store.setState(sampleState());
    expect(store.isLoading()).toBe(false);
  });

  it('toggleSelection adds + removes', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.toggleSelection('plex');
    expect(store.getSelection().has('plex')).toBe(true);
    store.toggleSelection('plex');
    expect(store.getSelection().has('plex')).toBe(false);
  });

  it('clearSelection only notifies when there is something to clear', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.clearSelection();
    expect(calls).toBe(0);
    store.toggleSelection('plex');
    store.clearSelection();
    expect(calls).toBe(2); // toggle + clear
  });

  it('setState drops stale selections', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.toggleSelection('plex');
    store.toggleSelection('radarr');
    expect(store.getSelection().size).toBe(2);
    // Recreate state without 'radarr'
    const next = sampleState();
    next.containers = next.containers.filter((c) => c.name !== 'radarr');
    store.setState(next);
    expect(store.getSelection().has('plex')).toBe(true);
    expect(store.getSelection().has('radarr')).toBe(false);
  });

  it('applyDelta updates cpu/state and notifies only on change', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.applyDelta({ name: 'plex', cpuPct: 12.5 });
    expect(store.getState().containers.find((c) => c.name === 'plex')!.cpuPct).toBe(12.5);
    expect(calls).toBe(1);
    // Re-apply identical delta — no notification
    store.applyDelta({ name: 'plex', cpuPct: 12.5 });
    expect(calls).toBe(1);
    // Apply to nonexistent container — no-op
    store.applyDelta({ name: 'ghost' });
    expect(calls).toBe(1);
  });

  it('applyDelta state transitions trigger notifications', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.applyDelta({ name: 'plex', state: 'stopped' });
    expect(calls).toBe(1);
    expect(store.getState().containers.find((c) => c.name === 'plex')!.state).toBe('stopped');
  });
});

describe('filterContainers', () => {
  it('all = no filter', () => {
    const state = sampleState();
    expect(
      filterContainers(state, { query: '', state: 'all', folderId: null, tagIds: [] }),
    ).toHaveLength(4);
  });

  it('state=running keeps only started', () => {
    const state = sampleState();
    const out = filterContainers(state, {
      query: '',
      state: 'running',
      folderId: null,
      tagIds: [],
    });
    expect(out.map((c) => c.name)).toEqual(['plex', 'sonarr', 'homepage']);
  });

  it('state=stopped keeps non-running (paused or stopped)', () => {
    const state = sampleState();
    state.containers.push(mkContainer({ name: 'paused-one', state: 'paused' }));
    const out = filterContainers(state, {
      query: '',
      state: 'stopped',
      folderId: null,
      tagIds: [],
    });
    expect(out.map((c) => c.name).sort()).toEqual(['paused-one', 'radarr']);
  });

  it('tag filter ANDs', () => {
    const state = sampleState();
    const out = filterContainers(state, {
      query: '',
      state: 'all',
      folderId: null,
      tagIds: ['t-gpu', 't-vpn'],
    });
    expect(out.map((c) => c.name)).toEqual(['sonarr']);
  });

  it('folder filter scopes to membership', () => {
    const state = sampleState();
    const out = filterContainers(state, {
      query: '',
      state: 'all',
      folderId: 'f-media',
      tagIds: [],
    });
    expect(out.map((c) => c.name).sort()).toEqual(['plex', 'radarr', 'sonarr']);
  });

  it('search matches name, image, tag name, folder name, port', () => {
    const state = sampleState();
    expect(
      filterContainers(state, { query: 'plex', state: 'all', folderId: null, tagIds: [] }),
    ).toHaveLength(1);
    expect(
      filterContainers(state, { query: 'gpu', state: 'all', folderId: null, tagIds: [] })
        .map((c) => c.name)
        .sort(),
    ).toEqual(['plex', 'sonarr']);
    expect(
      filterContainers(state, { query: 'media', state: 'all', folderId: null, tagIds: [] })
        .map((c) => c.name)
        .sort(),
    ).toEqual(['plex', 'radarr', 'sonarr']);
    expect(
      filterContainers(state, { query: '32400', state: 'all', folderId: null, tagIds: [] }).map(
        (c) => c.name,
      ),
    ).toEqual(['plex']);
  });
});

describe('groupContainers', () => {
  it('groups by folder + ungrouped tail', () => {
    const state = sampleState();
    const groups = groupContainers(state.containers, state.folders);
    expect(groups).toHaveLength(2);
    expect(groups[0].folder?.name).toBe('Media');
    expect(groups[0].containers.map((c) => c.name)).toEqual(['plex', 'sonarr', 'radarr']);
    expect(groups[1].folder).toBe(null);
    expect(groups[1].containers.map((c) => c.name)).toEqual(['homepage']);
  });

  it('hides folders that become empty after filtering', () => {
    const state = sampleState();
    const filtered = state.containers.filter((c) => c.name === 'homepage');
    const groups = groupContainers(filtered, state.folders);
    expect(groups).toHaveLength(1);
    expect(groups[0].folder).toBe(null);
  });

  it('preserves order within a folder by folder.containerNames', () => {
    const state = sampleState();
    state.folders[0].containerNames = ['radarr', 'plex', 'sonarr'];
    const groups = groupContainers(state.containers, state.folders);
    expect(groups[0].containers.map((c) => c.name)).toEqual(['radarr', 'plex', 'sonarr']);
  });
});

describe('collapse state — default + explicit toggle', () => {
  // Persisted toggles bleed between tests via localStorage — clear each time.
  beforeEach(() => {
    try {
      localStorage.removeItem('modernui-docker-collapsed');
    } catch {}
  });

  it('all folders match default when no explicit toggles', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    expect(store.isCollapsed('f-a')).toBe(false);
    expect(store.isCollapsed('f-b')).toBe(false);
    expect(store.isCollapsed('ungrouped')).toBe(false);

    store.setCollapseDefault('collapsed');
    expect(store.isCollapsed('f-a')).toBe(true);
    expect(store.isCollapsed('ungrouped')).toBe(true);
  });

  it('toggleCollapsed flips a folder relative to the default', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');
    expect(store.isCollapsed('f-media')).toBe(true); // flipped
    expect(store.isCollapsed('f-other')).toBe(false); // unchanged
    store.toggleCollapsed('f-media');
    expect(store.isCollapsed('f-media')).toBe(false); // flipped back
  });

  it('changing the default re-applies to non-toggled folders only', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media'); // media now collapsed
    expect(store.isCollapsed('f-media')).toBe(true);
    expect(store.isCollapsed('f-other')).toBe(false);

    store.setCollapseDefault('collapsed'); // flip the default
    expect(store.isCollapsed('f-other')).toBe(true); // follows new default
    expect(store.isCollapsed('f-media')).toBe(false); // toggle still flips → now expanded
  });

  it('survives setState (the filter-flip bug)', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');
    // Simulate a filter-driven re-render: same containers, different filter.
    store.setState({ containers: [], folders: [], tags: [], tagAssignments: {} });
    expect(store.isCollapsed('f-media')).toBe(true);
  });

  it('setCollapseAll clears per-folder overrides — the reverse-action bug', () => {
    // Repro: default=expanded, user manually collapses f-media (now in
    // explicitToggles → reads as collapsed). User then clicks the toolbar's
    // "Collapsed" button. Without setCollapseAll's clear, f-media flips to
    // !collapsed = expanded — the OPPOSITE of what the user wanted.
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');
    expect(store.isCollapsed('f-media')).toBe(true); // manually collapsed
    expect(store.isCollapsed('f-other')).toBe(false);

    store.setCollapseAll('collapsed');
    expect(store.isCollapsed('f-media')).toBe(true); // stays collapsed (was the user's intent)
    expect(store.isCollapsed('f-other')).toBe(true); // also collapsed now

    // And it works the other way — "Expand all" wins over a manual expand-then-collapse.
    store.toggleCollapsed('f-media'); // explicitly expand f-media (now in toggles vs collapsed default)
    expect(store.isCollapsed('f-media')).toBe(false);
    store.setCollapseAll('expanded');
    expect(store.isCollapsed('f-media')).toBe(false); // stays expanded
    expect(store.isCollapsed('f-other')).toBe(false); // also expanded
  });

  it('setCollapseAll persists the cleared toggle set to localStorage', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');
    // toggleCollapsed should have written the toggle to localStorage.
    expect(localStorage.getItem('modernui-docker-collapsed')).toContain('f-media');

    store.setCollapseAll('collapsed');
    // After "collapse all", the persisted toggle set is empty so a refresh
    // won't bring f-media back as a flipped override.
    const persisted = localStorage.getItem('modernui-docker-collapsed');
    expect(persisted === null || persisted === '[]').toBe(true);
  });
});

describe('updating state', () => {
  // localStorage bleed between tests would have one test's marked container
  // hydrated into another's fresh store. Wipe it before each run.
  beforeEach(() => {
    try {
      localStorage.removeItem('modernui-docker-updating');
    } catch {}
  });

  it('markUpdating flags containers and notifies once per batch', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.markUpdating(['plex', 'sonarr']);
    expect(store.getUpdating().has('plex')).toBe(true);
    expect(store.getUpdating().has('sonarr')).toBe(true);
    expect(calls).toBe(1);
  });

  it('markUpdating is idempotent — no notify when nothing changes', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.markUpdating(['plex']);
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.markUpdating(['plex']);
    expect(calls).toBe(0);
  });

  it('clears entries when the container id rotates (recreated post-pull)', () => {
    const store = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'old-id', updateAvailable: true });
    store.setState(s);
    store.markUpdating(['plex']);
    expect(store.getUpdating().has('plex')).toBe(true);

    const next = sampleState();
    next.containers[0] = mkContainer({ name: 'plex', id: 'new-id', updateAvailable: false });
    store.setState(next);
    expect(store.getUpdating().has('plex')).toBe(false);
  });

  it('force-clears the update badge on id rotation even if snapshot still says updateAvailable', () => {
    // The stuck-badge bug: Unraid's update-status cache can stay stale after an
    // update (reloadUpdateStatus reuses the cached local digest), so the snapshot
    // keeps reporting updateAvailable=true for a container we just recreated.
    // Because the id rotated, we know the pull succeeded — clear the badge.
    const store = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'old-id', updateAvailable: true });
    store.setState(s);
    store.markUpdating(['plex']);

    const next = sampleState();
    next.containers[0] = mkContainer({ name: 'plex', id: 'new-id', updateAvailable: true });
    store.setState(next);

    expect(store.getUpdating().has('plex')).toBe(false);
    expect(store.getState().containers[0].updateAvailable).toBe(false);
  });

  it('loses the badge force-clear if probes are cleared BEFORE the reconciling snapshot', () => {
    // Ordering contract for boot.ts onBatchComplete (the stuck-badge bug): the
    // id-rotation force-clear only runs while the update probe still exists.
    // clearAllUpdating() before the resync's setState() deletes the probe, so
    // reconcileUpdating() has nothing to match and the badge falls back to the
    // snapshot's stale updateAvailable=true. onBatchComplete must therefore
    // resync FIRST, then clear. This test pins that dependency so a future
    // reorder back to clear-then-resync fails loudly.
    const store = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'old-id', updateAvailable: true });
    store.setState(s);
    store.markUpdating(['plex']);

    // Wrong order: wipe probes before the recreated snapshot arrives.
    store.clearAllUpdating();
    const next = sampleState();
    next.containers[0] = mkContainer({ name: 'plex', id: 'new-id', updateAvailable: true });
    store.setState(next);

    // No probe survived, so the lagging-cache badge persists — the bug.
    expect(store.getState().containers[0].updateAvailable).toBe(true);
  });

  it('clears entries when updateAvailable flips true→false (id unchanged path)', () => {
    const store = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'same-id', updateAvailable: true });
    store.setState(s);
    store.markUpdating(['plex']);
    const next = sampleState();
    next.containers[0] = mkContainer({ name: 'plex', id: 'same-id', updateAvailable: false });
    store.setState(next);
    expect(store.getUpdating().has('plex')).toBe(false);
  });

  it('does NOT clear while updateAvailable is still true and id unchanged', () => {
    // Snapshot poll fires before docker finishes the recreate. We must keep
    // the row in the updating state — clearing too early would whiplash the UI.
    const store = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'abc', updateAvailable: true });
    store.setState(s);
    store.markUpdating(['plex']);
    // Same snapshot again — nothing changed
    store.setState({ ...s, containers: [...s.containers] });
    expect(store.getUpdating().has('plex')).toBe(true);
  });

  it('clearUpdating drops a single entry', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.markUpdating(['plex', 'sonarr']);
    store.clearUpdating('plex');
    expect(store.getUpdating().has('plex')).toBe(false);
    expect(store.getUpdating().has('sonarr')).toBe(true);
  });

  it('clearUpdating is a no-op when name was not marked', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.clearUpdating('plex');
    expect(calls).toBe(0);
  });

  it('clears when the container vanishes from the snapshot', () => {
    // E.g. user removed the container while the update was in flight; we
    // shouldn't dangle the updating set against a non-existent name.
    const store = createDockerStore();
    store.setState(sampleState());
    store.markUpdating(['radarr']);
    const next = sampleState();
    next.containers = next.containers.filter((c) => c.name !== 'radarr');
    store.setState(next);
    expect(store.getUpdating().has('radarr')).toBe(false);
  });

  it('persists across store recreate (refresh / nav-away scenario)', () => {
    const store1 = createDockerStore();
    store1.setState(sampleState());
    store1.markUpdating(['plex']);
    // Tab refresh — new store reads the same localStorage.
    const store2 = createDockerStore();
    expect(store2.getUpdating().has('plex')).toBe(true);
  });

  it('clearUpdating wipes storage so refresh doesnt resurrect cleared entries', () => {
    const store1 = createDockerStore();
    store1.setState(sampleState());
    store1.markUpdating(['plex']);
    store1.clearUpdating('plex');
    const store2 = createDockerStore();
    expect(store2.getUpdating().has('plex')).toBe(false);
  });

  it('reconcile clears completed updates from storage too', () => {
    const store1 = createDockerStore();
    const s = sampleState();
    s.containers[0] = mkContainer({ name: 'plex', id: 'old-id', updateAvailable: true });
    store1.setState(s);
    store1.markUpdating(['plex']);
    // Simulate the update completing while away — next snapshot has new id.
    const next = sampleState();
    next.containers[0] = mkContainer({ name: 'plex', id: 'new-id', updateAvailable: false });
    store1.setState(next);
    // Refresh — storage should have been wiped by the reconcile path.
    const store2 = createDockerStore();
    expect(store2.getUpdating().size).toBe(0);
  });

  it('drops entries older than the watchdog window on rehydrate', () => {
    // Manually write a stale entry (6 minutes ago) to localStorage. Without
    // the load-time filter, this zombie would sit there for the full poll
    // cycle before reconcileUpdating's timeout cleaned it up.
    const stale = {
      plex: { startedAt: Date.now() - 6 * 60_000, prevId: 'abc', prevUpdateAvailable: true },
    };
    localStorage.setItem('modernui-docker-updating', JSON.stringify(stale));
    const store = createDockerStore();
    expect(store.getUpdating().has('plex')).toBe(false);
  });
});

describe('starting state', () => {
  it('markStarting flags containers and notifies once per batch', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.markStarting(['plex', 'sonarr']);
    expect(store.getStarting().has('plex')).toBe(true);
    expect(store.getStarting().has('sonarr')).toBe(true);
    expect(calls).toBe(1);
  });

  it('markStarting is idempotent', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.markStarting(['plex']);
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.markStarting(['plex']);
    expect(calls).toBe(0);
  });

  it('clears starting once snapshot confirms started or paused', () => {
    const store = createDockerStore();
    const s = sampleState();
    s.containers[2] = mkContainer({ name: 'radarr', state: 'stopped' });
    store.setState(s);
    store.markStarting(['radarr']);
    expect(store.getStarting().has('radarr')).toBe(true);

    const next = sampleState();
    next.containers[2] = mkContainer({ name: 'radarr', state: 'started' });
    store.setState(next);
    expect(store.getStarting().has('radarr')).toBe(false);
  });

  it('does NOT clear starting while container is still reporting stopped', () => {
    // Boot-time autostart sequence: rc.docker hasn't reached this container
    // yet, so the snapshot keeps showing "stopped". Keeping the optimistic
    // spinner avoids whiplash between "Starting…" and "stopped".
    const store = createDockerStore();
    const s = sampleState();
    s.containers[2] = mkContainer({ name: 'radarr', state: 'stopped' });
    store.setState(s);
    store.markStarting(['radarr']);
    store.setState({ ...s });
    expect(store.getStarting().has('radarr')).toBe(true);
  });

  it('clears when the container vanishes from the snapshot', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.markStarting(['radarr']);
    const next = sampleState();
    next.containers = next.containers.filter((c) => c.name !== 'radarr');
    store.setState(next);
    expect(store.getStarting().has('radarr')).toBe(false);
  });

  it('clearAllUpdating wipes the whole updating set + persisted probes', () => {
    // Used by the /sub/docker _DONE_ handler: the stock update_container
    // script's end-of-batch marker means everything in the batch is done,
    // regardless of whether the digest-status cache has flushed yet.
    const store = createDockerStore();
    store.setState(sampleState());
    store.markUpdating(['plex', 'sonarr']);
    expect(store.getUpdating().size).toBe(2);

    store.clearAllUpdating();
    expect(store.getUpdating().size).toBe(0);

    // Persisted probes also gone — a refresh won't bring them back.
    const persisted = localStorage.getItem('modernui-docker-updating');
    expect(persisted === null || persisted === '{}').toBe(true);
  });

  it('clearStarting drops a single entry', () => {
    const store = createDockerStore();
    store.setState(sampleState());
    store.markStarting(['plex', 'sonarr']);
    store.clearStarting('plex');
    expect(store.getStarting().has('plex')).toBe(false);
    expect(store.getStarting().has('sonarr')).toBe(true);
  });

  it('does NOT persist across store recreate (unlike updating)', () => {
    // Starting is a UI-only optimistic flag — restoring it after a refresh
    // would be confusing because the action either succeeded or not by then.
    const store1 = createDockerStore();
    store1.setState(sampleState());
    store1.markStarting(['plex']);
    const store2 = createDockerStore();
    expect(store2.getStarting().has('plex')).toBe(false);
  });
});

describe('showStats flag', () => {
  it('defaults off and toggles via setShowStats', () => {
    const store = createDockerStore();
    expect(store.getShowStats()).toBe(false);
    store.setShowStats(true);
    expect(store.getShowStats()).toBe(true);
  });

  it('only notifies subscribers when the flag actually changes', () => {
    const store = createDockerStore();
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.setShowStats(true);
    store.setShowStats(true); // no-op
    store.setShowStats(false);
    expect(calls).toBe(2);
  });
});

describe('URL <-> filters', () => {
  it('round-trips an empty filter', () => {
    const f = { query: '', state: 'all' as const, folderId: null, tagIds: [] };
    expect(filtersToQuery(f)).toBe('');
    expect(filtersFromQuery('')).toEqual(f);
  });

  it('round-trips a full filter', () => {
    const f = { query: 'plex', state: 'running' as const, folderId: 'f-1', tagIds: ['t-a', 't-b'] };
    const qs = filtersToQuery(f);
    expect(qs).toContain('q=plex');
    expect(qs).toContain('state=running');
    expect(qs).toContain('folder=f-1');
    expect(qs).toContain('tags=t-a%2Ct-b');
    expect(filtersFromQuery(qs)).toEqual(f);
  });

  it('falls back state="all" for unknown values', () => {
    expect(filtersFromQuery('?state=nonsense').state).toBe('all');
  });
});
