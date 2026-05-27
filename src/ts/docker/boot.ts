import { createDockerStore, filtersFromQuery } from './store';
import { fetchSnapshot } from './actions';
import { createLiveSubscription } from './lifecycle';
import './components/md-docker-page';
import type { ModernuiDockerPage } from './components/md-docker-page';
import type { DockerDelta, DockerContainerState } from './types';

// Page detection. The .page Title="Docker Containers" lives at /Docker.
// Stock Docker also has subpages (/Docker/AddContainer, /Docker/UpdateContainer)
// — we leave those alone, stock UI handles them.
function onDockerPage(): boolean {
  return /^\/Docker\/?$/.test(window.location.pathname);
}

export function isDockerPageEnabled(doc: Document): boolean {
  // Same gate convention as the dashboard. Defaults ON.
  return doc.documentElement.dataset.modernuiDocker !== 'off';
}

// Build a parser that closes over the store so it can resolve container id -> name.
// The /sub/dockerload payload is undocumented and varies by Unraid version — we
// accept the common shapes and drop anything we can't read. The snapshot
// endpoint is authoritative; deltas only animate cpu/mem/state between snapshots.
function makeDeltaParser(store: ReturnType<typeof createDockerStore>): (raw: string) => DockerDelta | null {
  return (raw: string) => {
    if (typeof raw !== 'string' || raw.length === 0) return null;
    // Try JSON first (some Unraid versions wrap)
    if (raw.startsWith('{')) {
      try {
        const data = JSON.parse(raw) as Partial<DockerDelta> & { id?: string };
        if (typeof data.name === 'string') return data as DockerDelta;
        if (typeof data.id === 'string') {
          const c = store.getState().containers.find((x) => x.id.startsWith(data.id!) || x.id === data.id);
          if (!c) return null;
          return {
            name: c.name,
            state: data.state,
            cpuPct: data.cpuPct,
            memBytes: data.memBytes,
            uptime: data.uptime,
            updateAvailable: data.updateAvailable,
          };
        }
        return null;
      } catch { return null; }
    }
    // Fall back to semicolon: "id;running;cpu;mem"
    const parts = raw.split(';');
    if (parts.length < 2) return null;
    const id = parts[0];
    const c = store.getState().containers.find((x) => x.id.startsWith(id) || x.id === id);
    if (!c) return null;
    const running = parts[1] === '1' || parts[1] === 'true' || parts[1] === 'started';
    const state: DockerContainerState = running ? 'started' : 'stopped';
    const cpuPct = parts.length > 2 ? parseFloat(parts[2]) : undefined;
    const memBytes = parts.length > 3 ? parseInt(parts[3], 10) : undefined;
    return { name: c.name, state, cpuPct: Number.isFinite(cpuPct!) ? cpuPct : undefined,
             memBytes: Number.isFinite(memBytes!) ? memBytes : undefined };
  };
}

export async function boot(): Promise<void> {
  if (!isDockerPageEnabled(document)) return;
  if (!onDockerPage()) return;

  const root = document.querySelector<HTMLElement>('#modernui-docker-root');
  if (!root) return;            // mount point absent → stock page is rendering, bail silently

  const store = createDockerStore();
  store.setFilters(filtersFromQuery(window.location.search));
  // Default folder state (Expanded / Collapsed) flows from Settings → Theme
  // via loader.js → dataset attribute on <html>.
  const defaultFolderState = document.documentElement.dataset.modernuiDockerFolderDefault;
  if (defaultFolderState === 'collapsed' || defaultFolderState === 'expanded') {
    store.setCollapseDefault(defaultFolderState);
  }

  // Mount immediately so the page paints (loading state) before fetch resolves.
  const page = document.createElement('modernui-docker-page') as ModernuiDockerPage;
  page.setStore(store);
  root.appendChild(page);

  const resync = async (): Promise<void> => {
    try {
      const snapshot = await fetchSnapshot();
      store.setState({
        containers: snapshot.containers,
        folders: snapshot.folders,
        tags: snapshot.tags,
        tagAssignments: snapshot.tagAssignments,
      });
    } catch (err) {
      console.warn('[modernui-docker] snapshot failed:', err);
    }
  };

  await resync();

  // Subscribe to live deltas (cpu/mem/state). Visibility-aware: pauses while
  // hidden, resyncs on next visible. See lifecycle.ts.
  createLiveSubscription({
    url: '/sub/dockerload',
    parse: makeDeltaParser(store),
    onDelta: (d) => store.applyDelta(d),
    resync,
  });
}
