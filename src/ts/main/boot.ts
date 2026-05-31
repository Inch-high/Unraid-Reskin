// Boot entry for the Modern UI /Main page rebuild.
//
// Mirrors the Docker page's takeover model (see ../docker/boot.ts): the stock
// /Main `.page` files are replaced by overlays that emit a single
// `#modernui-main-root` mount point. This bundle loads on every page (via
// loader.js), exits early off-route, and only mounts when that root exists.
//
// Live nchan subscriptions land in Task 10; the operation-panel derive in 9.

import { createMainStore } from './store';
import { fetchSnapshot, fetchUnassigned } from './snapshot';
import { createMainLive, parseBusy } from './lifecycle';
import './components/md-main-page';
import type { ModernuiMainPage } from './components/md-main-page';

// Page detection. The Array/Devices management screen lives at /Main. Stock
// also has subpages (/Main/Device, /Main/Settings/Device) — we leave those to
// stock UI, so match /Main exactly (with optional trailing slash).
function onMainPage(): boolean {
  return /^\/Main\/?$/.test(window.location.pathname);
}

// Enable gate. Same convention as dashboard/docker: defaults ON; Settings →
// Theme → Main: Stock sets data-modernui-main="off" on <html> via loader.js.
export function isMainPageEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiMain !== 'off';
}

export async function boot(): Promise<void> {
  if (!isMainPageEnabled(document)) return;
  if (!onMainPage()) return;

  const root = document.querySelector<HTMLElement>('#modernui-main-root');
  if (!root) return; // mount point absent → stock page is rendering, bail silently

  // CSRF token for action POSTs, embedded by the ArrayDevices.page overlay from
  // $var['csrf_token'] (htmlspecialchars-escaped). This attribute is the sole
  // source: main-state.php deliberately omits the token from its read-only JSON
  // body so the per-boot token is never handed out in a readable response. The
  // resync/initial-fetch paths below backfill it onto each snapshot.
  const csrf = root.dataset.csrf ?? '';

  const store = createMainStore();

  // Resync: re-fetch the snapshot (after an action, or on an nchan signal in
  // Task 10). Debounced lightly so a burst of triggers collapses to one fetch.
  let resyncTimer: number | null = null;
  const resync = (): void => {
    if (resyncTimer !== null) return;
    resyncTimer = window.setTimeout(async () => {
      resyncTimer = null;
      try {
        const snap = await fetchSnapshot();
        snap.csrfToken = snap.csrfToken || csrf;
        store.setState(snap);
      } catch (err) {
        console.warn('[modernui-main] resync failed:', err);
      }
      // Optional Unassigned Devices state (separate, best-effort — never blocks
      // the core snapshot). The card hides itself when unavailable.
      fetchUnassigned()
        .then((u) => page.setUnassigned(u))
        .catch(() => undefined);
    }, 150);
  };

  // Mount immediately so the page paints a skeleton before the fetch resolves.
  const page = document.createElement('modernui-main-page') as ModernuiMainPage;
  page.setStore(store);
  page.resync = resync;
  root.appendChild(page);

  try {
    const snapshot = await fetchSnapshot();
    snapshot.csrfToken = snapshot.csrfToken || csrf;
    store.setState(snapshot);
  } catch (err) {
    console.warn('[modernui-main] snapshot fetch failed:', err);
  }

  // Initial Unassigned Devices fetch (best-effort; card hides if unavailable).
  fetchUnassigned()
    .then((u) => page.setUnassigned(u))
    .catch(() => undefined);

  // Live updates. The ArrayOperation.page overlay keeps the
  // Nchan="device_list,disk_load,parity_list" attribute, so emhttp publishes
  // these channels. Most signals just mean "state changed → resync"; mymonitor
  // additionally carries the busy int, which we apply immediately so the
  // Stop/Spin/Mover buttons gate without waiting for the snapshot round-trip.
  createMainLive({
    resync,
    channels: [
      { url: '/sub/devices', handle: () => resync() },
      { url: '/sub/fsState', handle: () => resync() },
      { url: '/sub/paritymonitor', handle: () => resync() },
      { url: '/sub/arraymonitor', handle: () => resync() },
      {
        url: '/sub/mymonitor',
        handle: (raw) => {
          const busy = parseBusy(raw);
          if (busy !== null) store.setBusy(busy);
          resync();
        },
      },
    ],
  });
}
