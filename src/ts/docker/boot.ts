import { createDockerStore, filtersFromQuery } from './store';
import { fetchSnapshot } from './actions';
import { readCachedSnapshot, writeCachedSnapshot } from './snapshot-cache';
import { createLiveSubscription } from './lifecycle';
import { createUpdateProgressStore } from './update-progress';
import './components/md-docker-page';
import type { ModernuiDockerPage } from './components/md-docker-page';
import type { DockerDelta } from './types';

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

// True when an incoming snapshot is an empty container list while the store
// already holds containers. docker-state.php returns `containers: []` (still
// HTTP 200) during the window the stock update_container flow rewrites the
// webui-info docker.json that getAllInfo() reads. Accepting it would blank the
// page and poison the SWR cache; resync() skips the overwrite in that case and
// waits for the next snapshot. First load (currentCount === 0) falls through so
// a genuinely empty server still renders the empty state.
export function isTransientEmptySnapshot(incomingCount: number, currentCount: number): boolean {
  return incomingCount === 0 && currentCount > 0;
}

// Parse a docker-style size string like "25.34MiB" or "1.5GiB" into bytes.
// Matches the format `docker stats --format='{{.MemUsage}}'` produces; MiB/GiB
// use 1024 base, MB/GB use 1000 base per Docker CLI conventions.
const SIZE_RX = /^([\d.]+)\s*([A-Za-z]*)$/;
const SIZE_MULT: Record<string, number> = {
  '': 1,
  B: 1,
  KB: 1000,
  KIB: 1024,
  MB: 1_000_000,
  MIB: 1024 ** 2,
  GB: 1_000_000_000,
  GIB: 1024 ** 3,
  TB: 1_000_000_000_000,
  TIB: 1024 ** 4,
};
function parseSize(s: string): number | undefined {
  const m = SIZE_RX.exec(s.trim());
  if (!m) return undefined;
  const mult = SIZE_MULT[m[2].toUpperCase()] ?? 1;
  const n = Number.parseFloat(m[1]) * mult;
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

// Build a parser that closes over the store so it can resolve container id -> name.
// The /sub/dockerload payload format (per dynamix.docker.manager/nchan/docker_load):
//
//   shortid;CPUPerc;MemUsage
//   shortid;CPUPerc;MemUsage
//   ...
//
// where MemUsage is "X.XXMiB / Y.YYGiB" (used / limit). One message contains
// every running container in one newline-separated batch.
function makeDeltaParser(
  store: ReturnType<typeof createDockerStore>,
): (raw: string) => DockerDelta[] {
  return (raw: string) => {
    if (typeof raw !== 'string' || raw.length === 0) return [];

    // JSON wrapper (some Unraid versions / future use)
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw);
        const arr = Array.isArray(data) ? data : [data];
        return arr.flatMap((d) => {
          if (typeof d?.name === 'string') return [d as DockerDelta];
          if (typeof d?.id === 'string') {
            const c = resolveById(store, d.id);
            return c ? [{ name: c.name, ...d } as DockerDelta] : [];
          }
          return [];
        });
      } catch {
        return [];
      }
    }

    // Newline-delimited "id;cpu;mem" — the docker_load nchan worker shape.
    const out: DockerDelta[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(';');
      if (parts.length < 3) continue;
      const id = parts[0].trim();
      const c = resolveById(store, id);
      if (!c) continue;
      const cpuRaw = parts[1].replace('%', '').trim();
      const cpuPct = cpuRaw === '' ? undefined : Number.parseFloat(cpuRaw);
      const memUsed = parts[2].split('/')[0]?.trim() ?? '';
      const memBytes = parseSize(memUsed);
      out.push({
        name: c.name,
        cpuPct: Number.isFinite(cpuPct!) ? cpuPct : undefined,
        memBytes,
      });
    }
    return out;
  };
}

function resolveById(
  store: ReturnType<typeof createDockerStore>,
  id: string,
): { name: string } | null {
  if (!id) return null;
  const list = store.getState().containers;
  for (const c of list) {
    if (c.id === id || c.id.startsWith(id) || id.startsWith(c.id)) return c;
  }
  return null;
}

export async function boot(): Promise<void> {
  if (!isDockerPageEnabled(document)) return;
  if (!onDockerPage()) return;

  const root = document.querySelector<HTMLElement>('#modernui-docker-root');
  if (!root) return; // mount point absent → stock page is rendering, bail silently

  const store = createDockerStore();
  store.setFilters(filtersFromQuery(window.location.search));
  // Default folder state (Expanded / Collapsed) flows from Settings → Theme
  // via loader.js → dataset attribute on <html>.
  const defaultFolderState = document.documentElement.dataset.modernuiDockerFolderDefault;
  if (defaultFolderState === 'collapsed' || defaultFolderState === 'expanded') {
    store.setCollapseDefault(defaultFolderState);
  }
  // "Show stats" — populates CPU/RAM/VDisk/MAC lines on each row and sums on
  // collapsed folder headers. Default off because /containers/json?size=true
  // walks each container's RW layer (cheap-ish but not free at boot time).
  if (document.documentElement.dataset.modernuiDockerStats === 'on') {
    store.setShowStats(true);
  }

  // Mutable holder for the most recent raw snapshot — we need serverUptime
  // outside the function scope for the boot-detection gate below. (The store
  // doesn't retain server-meta fields; only the data subset.)
  let lastServerUptime: number | null = null;

  // Declared as a function expression so we can reference it from the
  // progressStore's onBatchComplete closure below. (A `const resync = …`
  // arrow would be TDZ at the point of progressStore creation.)
  async function resync(): Promise<void> {
    try {
      // Only request stats when the toggle is on — saves a second+ on
      // every fetch when stats aren't shown. nchan deltas keep CPU/RAM
      // fresh for running containers regardless.
      const snapshot = await fetchSnapshot({ withStats: store.getShowStats() });
      lastServerUptime = snapshot.serverUptime;
      // Guard against a transient empty snapshot clobbering good state. While the
      // stock update_container flow recreates a container, it rewrites the
      // webui-info docker.json that getAllInfo() reads; for that window
      // docker-state.php returns `containers: []` — still HTTP 200, so the catch
      // below never fires. Accepting it would blank the page AND poison the SWR
      // cache (writeCachedSnapshot), leaving it blank across refreshes until the
      // update finished. Keep current state and wait for the next resync (nchan
      // delta / update-complete callback) to deliver the real list.
      if (
        isTransientEmptySnapshot(snapshot.containers.length, store.getState().containers.length)
      ) {
        return;
      }
      store.setState({
        containers: snapshot.containers,
        folders: snapshot.folders,
        tags: snapshot.tags,
        tagAssignments: snapshot.tagAssignments,
      });
      // Stash for the next boot's instant paint (SWR). Best-effort.
      writeCachedSnapshot(snapshot);
    } catch (err) {
      console.warn('[modernui-docker] snapshot failed:', err);
    }
  }

  // Update-progress store. Subscribes to /sub/docker (the same channel stock
  // Unraid's update_container script publishes to) and exposes a reactive
  // snapshot of the in-flight pull/recreate sequence. The page mounts a panel
  // that consumes this.
  //
  // The onBatchComplete callback fires on the script's `_DONE_` marker. We
  // resync THEN clear the updating set — order matters. reconcileUpdating()
  // force-clears a recreated container's stale "update available" badge (the
  // Unraid digest cache lags after a pull; see store.ts), but only while that
  // container's update probe still exists. Clearing probes first — as this used
  // to — left reconcile nothing to match, so the freshly-updated badge persisted
  // on the lagging cache until a manual page reload. So: resync first (the
  // rotated-id snapshot reconciles and clears the badge), then clearAllUpdating
  // mops up any probe that didn't self-reconcile (a no-op/failed update) so the
  // panel doesn't sit on "Working…" until the 5-min watchdog.
  const progressStore = createUpdateProgressStore(
    (image) => {
      // image string ("linuxserver/plex:latest") → container.name. Match
      // verbatim first, then fall back to ignoring the tag — the pull log
      // sometimes adds ":latest" that the snapshot's image string lacks.
      const list = store.getState().containers;
      for (const c of list) if (c.image === image) return c.name;
      const stripTag = (s: string): string => s.replace(/:[^:/]+$/, '');
      const stripped = stripTag(image);
      for (const c of list) if (stripTag(c.image) === stripped) return c.name;
      return null;
    },
    () => {
      void resync().then(() => store.clearAllUpdating());
    },
  );

  // Mount immediately so the page paints before the fetch resolves.
  const page = document.createElement('modernui-docker-page') as ModernuiDockerPage;
  page.setStore(store);
  page.setUpdateProgressStore(progressStore);
  root.appendChild(page);

  // Stale-while-revalidate: hydrate from the last cached snapshot so the page
  // paints real rows instantly instead of a loading state. The resync() below
  // revalidates against the server and overwrites. Skipped silently if there's
  // no cache (first-ever visit / expired / private mode).
  const cached = readCachedSnapshot();
  if (cached) {
    store.setState({
      containers: cached.containers,
      folders: cached.folders,
      tags: cached.tags,
      tagAssignments: cached.tagAssignments,
    });
  }

  await resync();

  // Detect a post-reboot autostart-in-progress sequence. rc.docker reads
  // /var/lib/docker/unraid-autostart at boot and starts each listed container
  // sequentially with optional WAIT between them. While that's running, the
  // dashboard snapshot shows some containers as `stopped` even though they're
  // about to be started in seconds. Without this signal the user sees no
  // movement until the next manual refresh (nchan only carries CPU/RAM
  // deltas). The heuristic: any container with autostart=true that is
  // currently `stopped`. Mark them as "starting" so the row spinner appears,
  // and let the starting poll confirm the transition.
  //
  // Gate on system uptime so we don't misfire hours after boot for a
  // crashed-but-autostart-enabled container. 5 min covers the longest
  // realistic rc.docker chain (per STARTING_TIMEOUT_MS in store.ts) while
  // safely excluding the steady-state case.
  const BOOT_AUTOSTART_WINDOW_S = 5 * 60;
  if (lastServerUptime !== null && lastServerUptime <= BOOT_AUTOSTART_WINDOW_S) {
    const snapshot = store.getState();
    const bootCandidates = snapshot.containers
      .filter((c) => c.autostart && c.state === 'stopped')
      .map((c) => c.name);
    if (bootCandidates.length > 0) {
      // markStarting notifies subscribers; the page's setStore() subscriber
      // sees the non-empty starting set and kicks off _startStartingPoll().
      store.markStarting(bootCandidates);
    }
  }

  // Subscribe to live deltas (cpu/mem/state). Visibility-aware: pauses while
  // hidden, resyncs on next visible. See lifecycle.ts.
  createLiveSubscription({
    url: '/sub/dockerload',
    parse: makeDeltaParser(store),
    onDelta: (d) => store.applyDelta(d),
    resync,
  });

  // Subscribe to the update-progress stream (/sub/docker — the channel stock
  // Unraid's update_container script publishes to). Plain nchan subscription;
  // no visibility gating because (a) the panel is hidden while tab is hidden
  // anyway, and (b) missing messages would leave the panel stuck on stale
  // data when the user comes back. If progress drifts, the next progress
  // event refreshes it and reconcileUpdating() picks up completion.
  // Reuses the global NchanSubscriber type declared in lifecycle.ts. No
  // visibility gating here (unlike createLiveSubscription) — see the note above.
  const Nchan = window.NchanSubscriber;
  if (Nchan) {
    const sub = new Nchan('/sub/docker', { subscriber: 'websocket' });
    sub.on('message', (raw) => progressStore.handleMessage(raw));
    sub.start();
  }
}
