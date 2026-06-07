import { createDockerStore, filtersFromQuery } from './store';
import { fetchSnapshot, SnapshotError } from './actions';
import { readCachedSnapshot, writeCachedSnapshot } from './snapshot-cache';
import { createLiveSubscription } from './lifecycle';
import { createUpdateProgressStore } from './update-progress';
import { dlog, isDockerDebug } from './debug';
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

// Wait for #modernui-docker-root to appear in the DOM, up to a timeout. Returns
// the element once present, or null if it never shows. Needed because the newer
// Unraid web-component shell can inject the legacy .page body (which contains our
// mount point) a tick after our head-loaded bundle executes — so a one-shot
// querySelector at script-eval time races and can miss it, especially on a
// re-navigation. A MutationObserver catches the insertion; the timeout stops us
// waiting forever on a page that genuinely has no mount point (stock UI).
function waitForRoot(timeoutMs = 10_000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>('#modernui-docker-root');
    if (existing) {
      resolve(existing);
      return;
    }
    let settled = false;
    const finish = (el: HTMLElement | null): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(el);
    };
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>('#modernui-docker-root');
      if (el) finish(el);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}

export async function boot(): Promise<void> {
  // Logged BEFORE the guards so we can tell "boot never ran" (no line at all)
  // apart from "boot ran but bailed at a guard" (this line, then a bail line).
  // The reported symptom — debug banner prints but nothing else — means boot
  // returned at one of the three guards below without throwing.
  dlog('boot: entry', {
    path: window.location.pathname,
    search: window.location.search,
    readyState: document.readyState,
    dockerFlag: document.documentElement.dataset.modernuiDocker,
    rootPresent: !!document.querySelector('#modernui-docker-root'),
  });

  if (!isDockerPageEnabled(document)) {
    dlog('boot: BAIL — page disabled (data-modernui-docker=off)');
    return;
  }
  if (!onDockerPage()) {
    dlog('boot: BAIL — not on /Docker', { pathname: window.location.pathname });
    return;
  }

  let root = document.querySelector<HTMLElement>('#modernui-docker-root');
  if (!root) {
    // The mount point wasn't in the DOM at script-eval time. On the newer Unraid
    // web-component shell the legacy .page content (our root div) can be injected
    // a tick AFTER our head-loaded bundle runs — especially on a re-navigation —
    // so bailing immediately (as before) left the page permanently blank. Wait
    // for it instead of giving up.
    dlog('boot: root absent at entry — waiting for mount point', {
      readyState: document.readyState,
    });
    root = await waitForRoot();
    if (!root) {
      dlog('boot: BAIL — mount point never appeared');
      return;
    }
    dlog('boot: root appeared after wait');
  }

  dlog('boot: start', { path: window.location.pathname, search: window.location.search });

  const store = createDockerStore();
  store.setFilters(filtersFromQuery(window.location.search));
  // Surface how many "updating" probes survived the navigation. This is the
  // crux of the navigate-away-during-update repro: a container UPDATE persists
  // a probe (so md-docker-page restarts a poll that recovers from a boot 503),
  // but a CHECK-FOR-UPDATES persists nothing — so if the boot resync 503s with
  // no usable cache, nothing retries and the page stays on the skeleton.
  dlog('boot: hydrated updating probes', { count: store.getUpdating().size });
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
      // docker-state.php returns 503 during the window the stock update_container
      // flow rewrites the webui-info docker.json that getAllInfo() reads (the
      // container list is momentarily empty though the daemon still has them).
      // fetchSnapshot() throws on that non-200, so the catch below keeps the
      // current state and we retry on the next resync — instead of blanking the
      // page and poisoning the SWR cache with an empty list. A genuinely empty
      // server returns 200 with an empty list and renders the empty state.
      const snapshot = await fetchSnapshot({ withStats: store.getShowStats() });
      lastServerUptime = snapshot.serverUptime;
      store.setState({
        containers: snapshot.containers,
        folders: snapshot.folders,
        tags: snapshot.tags,
        tagAssignments: snapshot.tagAssignments,
      });
      // Stash for the next boot's instant paint (SWR). Best-effort.
      writeCachedSnapshot(snapshot);
      dlog('resync: applied snapshot', {
        containers: snapshot.containers.length,
        loading: store.isLoading(),
      });
    } catch (err) {
      // A transient 503 means the stock backend is mid-rewrite (update or
      // check-for-updates in flight). We keep the current state and retry on the
      // next resync — but on a COLD boot there's no current state and (for a
      // check-for-updates) no probe-driven poll to retry, so loading stays true
      // and the page sits on the skeleton. That stuck-loading combination is the
      // signature of the reported bug; logging it makes it unmistakable.
      const transient = err instanceof SnapshotError && err.isTransient;
      dlog('resync: FAILED', {
        transient,
        status: err instanceof SnapshotError ? err.status : undefined,
        stillLoading: store.isLoading(),
        haveContainers: store.getState().containers.length,
        updatingProbes: store.getUpdating().size,
        err: String(err),
      });
      if (transient && store.isLoading()) {
        dlog(
          'resync: STUCK — boot resync 503 with empty store and no rendered rows; ' +
            'nothing will retry unless an updating probe or a visibility flip fires',
        );
      }
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
      dlog('progress: _DONE_ batch complete — resync then clearAllUpdating');
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
    dlog('cache: HIT — hydrated from sessionStorage', { containers: cached.containers.length });
  } else {
    // No cache → if the resync below 503s, the store has nothing to paint and
    // loading never clears. This is the cold-boot half of the bug.
    dlog('cache: MISS — no usable SWR snapshot; loading state depends on resync');
  }

  // Expose the live stores for console inspection while debugging, e.g.
  // window.__modernuiDocker.store.isLoading(). Only attached when debug is on.
  if (isDockerDebug()) {
    (window as unknown as { __modernuiDocker?: unknown }).__modernuiDocker = {
      store,
      progressStore,
      resync,
    };
  }

  await resync();
  dlog('boot: initial resync settled', {
    loading: store.isLoading(),
    containers: store.getState().containers.length,
  });

  // If a "check for updates" worker is still running server-side (the user
  // started one, then navigated away and back), re-attach the "Checking…" UI
  // and resume polling so the page reflects the in-flight run and refreshes the
  // update badges when it completes — instead of looking idle while the worker
  // keeps walking the registry. Fire-and-forget; it self-cancels if nothing is
  // running.
  void page.resumeCheckForUpdatesIfRunning();

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
