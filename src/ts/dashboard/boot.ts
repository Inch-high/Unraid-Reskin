import { createStore } from './store';
import { createSourceObserver } from './source-observer';
import { dispatch } from './extractors';
import { collectDashboardTables, collectDashboardTbodies } from './dom-walk';
import './components/md-dashboard';
import type { ModernuiDashboard } from './components/md-dashboard';

function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
}

export function isDashboardEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiDashboard !== 'off';
}

function waitForSource(
  timeoutMs: number,
  onReady: () => void,
  onTimeout: () => void,
): void {
  if (collectDashboardTables().length > 0) {
    onReady();
    return;
  }
  const observer = new MutationObserver(() => {
    if (collectDashboardTables().length > 0) {
      observer.disconnect();
      clearTimeout(timeoutHandle);
      onReady();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeoutHandle = window.setTimeout(() => {
    observer.disconnect();
    onTimeout();
  }, timeoutMs);
}

function extractAll(store: ReturnType<typeof createStore>): void {
  const tbodies = collectDashboardTbodies();
  const seen = new Set<string>();
  for (const tbody of tbodies) {
    const result = dispatch({ source: tbody });
    if (!result) continue;
    const id = (result as { id?: string }).id || tbody.id || `idx-${seen.size}`;
    seen.add(id);
    store.set(id, result);
  }
  // Remove widgets that have disappeared
  for (const key of Array.from(store.keys())) {
    if (!seen.has(key)) store.delete(key);
  }
}

// Widget kinds whose source tbodies lose their live DOM-mutation update path
// in Unraid 7.3 — specifically the UPS (.nut_loadpct/.nut_bcharge spans go
// stale after the modern <footer> chrome takes over), VMs (libvirt.json may
// re-inject tiles without bubbling characterData mutations our observer
// catches), and Docker (occasional missed updates when many tiles rewrite
// rapidly). Static widgets like identity / motherboard / shares / users
// don't need a periodic re-extract — they change only on user action, which
// already triggers the MutationObserver path.
const LIVE_WIDGET_KINDS = new Set(['ups', 'vms', 'docker']);

function extractLive(store: ReturnType<typeof createStore>): void {
  // Cheaper than extractAll: dispatches each tbody but only writes back to
  // the store when the result is one of LIVE_WIDGET_KINDS. Doesn't touch the
  // deletion bookkeeping — that's still owned by the main extractAll path
  // (a widget disappearing is a structural change, which the MutationObserver
  // already catches).
  for (const tbody of collectDashboardTbodies()) {
    const result = dispatch({ source: tbody });
    if (!result || !LIVE_WIDGET_KINDS.has(result.kind)) continue;
    const id = (result as { id?: string }).id || tbody.id || result.kind;
    store.set(id, result);
  }
}

export function boot(): void {
  if (!isDashboardEnabled(document)) return;
  if (!onDashboardPage()) return;

  waitForSource(
    5000,
    () => {
      document.body.classList.add('modernui-dashboard-active');

      // Find or create the mount container
      const container = document.querySelector('div.frame') || document.body;
      const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
      container.appendChild(root);

      // Wire store
      const store = createStore();
      root.setStore(store);

      // Initial sync across all dashboard tables
      extractAll(store);

      // Watch every table for live updates (Unraid renders db_box1/2/3)
      for (const table of collectDashboardTables()) {
        const obs = createSourceObserver(table, () => extractAll(store), 50);
        obs.start();
      }

      // Safety-net periodic refresh. The MutationObserver above catches DOM
      // changes when Unraid actively rewrites a tbody, but in 7.3 some legacy
      // dashboard widgets (notably the UPS tbody) stop receiving live DOM
      // updates while the modern <footer> chrome continues to refresh. Without
      // this, the Power hero card would stay frozen at first-paint values.
      //
      // Narrowed to UPS/VMs/Docker via extractLive() — the static widgets
      // (identity, motherboard, shares, users) don't need polling and the
      // others already update via the observer reliably. Cadence matches the
      // sidebar's existing 5s interval. Pauses while hidden, catches up on
      // focus (cf. webgui#2641).
      window.setInterval(() => {
        if (!document.hidden) extractLive(store);
      }, 5000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) extractLive(store);
      });
    },
    () => {
      console.warn('[modernui-dashboard] source not found; leaving stock UI');
    },
  );
}
