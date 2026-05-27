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
    mkContainer({ name: 'plex', image: 'lib/plex:latest', state: 'started', ports: [{ host: '192.0.2.1', hostPort: '32400', containerPort: '32400', proto: 'tcp' }] }),
    mkContainer({ name: 'sonarr', image: 'lib/sonarr:latest', state: 'started' }),
    mkContainer({ name: 'radarr', image: 'lib/radarr:latest', state: 'stopped' }),
    mkContainer({ name: 'homepage', image: 'lib/homepage:latest', state: 'started' }),
  ],
  folders: [
    { id: 'f-media', name: 'Media', icon: 'film', color: '#ff8c2f', containerNames: ['plex', 'sonarr', 'radarr'] },
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
    store.subscribe(() => { calls++; });
    expect(store.getState().containers).toEqual([]);
    store.setState(sampleState());
    expect(calls).toBe(1);
    expect(store.getState().containers.length).toBe(4);
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
    store.subscribe(() => { calls++; });
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
    store.subscribe(() => { calls++; });
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
    store.subscribe(() => { calls++; });
    store.applyDelta({ name: 'plex', state: 'stopped' });
    expect(calls).toBe(1);
    expect(store.getState().containers.find((c) => c.name === 'plex')!.state).toBe('stopped');
  });
});

describe('filterContainers', () => {
  it('all = no filter', () => {
    const state = sampleState();
    expect(filterContainers(state, { query: '', state: 'all', folderId: null, tagIds: [] })).toHaveLength(4);
  });

  it('state=running keeps only started', () => {
    const state = sampleState();
    const out = filterContainers(state, { query: '', state: 'running', folderId: null, tagIds: [] });
    expect(out.map((c) => c.name)).toEqual(['plex', 'sonarr', 'homepage']);
  });

  it('state=stopped keeps non-running (paused or stopped)', () => {
    const state = sampleState();
    state.containers.push(mkContainer({ name: 'paused-one', state: 'paused' }));
    const out = filterContainers(state, { query: '', state: 'stopped', folderId: null, tagIds: [] });
    expect(out.map((c) => c.name).sort()).toEqual(['paused-one', 'radarr']);
  });

  it('tag filter ANDs', () => {
    const state = sampleState();
    const out = filterContainers(state, { query: '', state: 'all', folderId: null, tagIds: ['t-gpu', 't-vpn'] });
    expect(out.map((c) => c.name)).toEqual(['sonarr']);
  });

  it('folder filter scopes to membership', () => {
    const state = sampleState();
    const out = filterContainers(state, { query: '', state: 'all', folderId: 'f-media', tagIds: [] });
    expect(out.map((c) => c.name).sort()).toEqual(['plex', 'radarr', 'sonarr']);
  });

  it('search matches name, image, tag name, folder name, port', () => {
    const state = sampleState();
    expect(filterContainers(state, { query: 'plex',   state: 'all', folderId: null, tagIds: [] })).toHaveLength(1);
    expect(filterContainers(state, { query: 'gpu',    state: 'all', folderId: null, tagIds: [] }).map((c) => c.name).sort()).toEqual(['plex', 'sonarr']);
    expect(filterContainers(state, { query: 'media',  state: 'all', folderId: null, tagIds: [] }).map((c) => c.name).sort()).toEqual(['plex', 'radarr', 'sonarr']);
    expect(filterContainers(state, { query: '32400',  state: 'all', folderId: null, tagIds: [] }).map((c) => c.name)).toEqual(['plex']);
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
  beforeEach(() => { try { localStorage.removeItem('modernui-docker-collapsed'); } catch {} });

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
    expect(store.isCollapsed('f-media')).toBe(true);  // flipped
    expect(store.isCollapsed('f-other')).toBe(false); // unchanged
    store.toggleCollapsed('f-media');
    expect(store.isCollapsed('f-media')).toBe(false); // flipped back
  });

  it('changing the default re-applies to non-toggled folders only', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');                  // media now collapsed
    expect(store.isCollapsed('f-media')).toBe(true);
    expect(store.isCollapsed('f-other')).toBe(false);

    store.setCollapseDefault('collapsed');             // flip the default
    expect(store.isCollapsed('f-other')).toBe(true);   // follows new default
    expect(store.isCollapsed('f-media')).toBe(false);  // toggle still flips → now expanded
  });

  it('survives setState (the filter-flip bug)', () => {
    const store = createDockerStore();
    store.setCollapseDefault('expanded');
    store.toggleCollapsed('f-media');
    // Simulate a filter-driven re-render: same containers, different filter.
    store.setState({ containers: [], folders: [], tags: [], tagAssignments: {} });
    expect(store.isCollapsed('f-media')).toBe(true);
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
    store.subscribe(() => { calls++; });
    store.setShowStats(true);
    store.setShowStats(true);   // no-op
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
