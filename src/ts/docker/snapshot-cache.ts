// Stale-while-revalidate cache for the docker snapshot.
//
// Every visit to /Docker shows a loading state until fetchSnapshot() resolves.
// On a cold webui-info cache that fetch walks each container's template + icon
// path server-side, so the page can sit blank for a noticeable beat. We stash
// the last good snapshot in sessionStorage and re-hydrate the store from it on
// boot — the page paints real rows instantly, then the live fetch revalidates
// and overwrites (SWR). State/CPU/updateAvailable in the cached copy may be a
// few seconds stale; the resync that runs right after corrects it.
//
// sessionStorage (not localStorage): the cache is per-tab and naturally expires
// when the tab closes — we never want to paint a snapshot from a session days
// old. A short TTL guards against a backgrounded tab restoring ancient state.

import type { DockerSnapshot } from './actions';

const SNAPSHOT_STORAGE_KEY = 'modernui-docker-snapshot';

// 10 min. Long enough to cover a quick navigate-away-and-back, short enough
// that a stale paint is never more than mildly out of date before the resync
// (which fires on the same boot) reconciles it.
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

interface PersistedSnapshot {
  snapshot: DockerSnapshot;
  savedAt: number;
}

// Read the last cached snapshot, or null if absent / expired / unparsable.
// Expired or corrupt entries are removed so we don't keep re-parsing them.
export function readCachedSnapshot(): DockerSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedSnapshot>;
    if (!data || typeof data !== 'object' || typeof data.savedAt !== 'number') {
      sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }
    if (Date.now() - data.savedAt > SNAPSHOT_TTL_MS) {
      sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }
    const snap = data.snapshot;
    // Minimal shape guard — a malformed cache (e.g. from an older build) must
    // not crash boot. We only require the containers array; everything else
    // the store tolerates as empty.
    if (!snap || !Array.isArray(snap.containers)) {
      sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }
    return snap;
  } catch {
    // quota / private mode / parse error — treat as no cache.
    return null;
  }
}

// Persist the latest snapshot for the next boot's instant paint. Best-effort:
// quota or private-mode failures are swallowed.
export function writeCachedSnapshot(snapshot: DockerSnapshot): void {
  try {
    const data: PersistedSnapshot = { snapshot, savedAt: Date.now() };
    sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — silent best-effort */
  }
}
