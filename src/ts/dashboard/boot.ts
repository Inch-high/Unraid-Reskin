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

  // Mount the overlay as early as possible — but it MUST go inside div.frame
  // so the dashboard-overlay.scss grid-stacking rule (which keys on
  // `div.frame > modernui-dashboard` and `div.frame > div.grid` sharing the
  // same grid cell) wins over the stock layout. If we append to body when
  // div.frame doesn't exist yet, the stock dashboard renders on top of us
  // and the user sees the legacy UI (regression in ba9eb21).
  const store = createStore();
  const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
  root.setStore(store);

  // Track the observers we attach so we don't double-bind once tables appear.
  const observed = new WeakSet<HTMLTableElement>();
  const attachObservers = (): void => {
    for (const table of collectDashboardTables()) {
      if (observed.has(table)) continue;
      observed.add(table);
      const obs = createSourceObserver(table, () => extractAll(store), 50);
      obs.start();
    }
  };

  const mountInto = (frame: Element): void => {
    if (root.isConnected) return;
    document.body.classList.add('modernui-dashboard-active');
    frame.appendChild(root);
    extractAll(store);
    attachObservers();
  };

  const watchForTables = (): void => {
    if (collectDashboardTables().length > 0) {
      extractAll(store);
      attachObservers();
      return;
    }
    // Tables come later (Unraid 7.3 Vue-renders them after div.frame mounts).
    const sourceScope = document.querySelector('div.content') || document.body;
    const tablesObserver = new MutationObserver(() => {
      if (collectDashboardTables().length > 0) {
        tablesObserver.disconnect();
        extractAll(store);
        attachObservers();
      }
    });
    tablesObserver.observe(sourceScope, { childList: true, subtree: true });
    window.setTimeout(() => tablesObserver.disconnect(), 10_000);
  };

  // div.frame is Unraid chrome — Vue mounts it ahead of the per-tile data,
  // typically within ~100-500ms of page load. If it's already there at boot,
  // we mount synchronously (fast path); otherwise we watch for it.
  const existing = document.querySelector('div.frame');
  if (existing) {
    mountInto(existing);
    watchForTables();
  } else {
    const frameObserver = new MutationObserver(() => {
      const frame = document.querySelector('div.frame');
      if (frame) {
        frameObserver.disconnect();
        mountInto(frame);
        watchForTables();
      }
    });
    frameObserver.observe(document.body, { childList: true, subtree: true });
    // Safety: if div.frame never appears (older / non-standard Unraid build),
    // leave the stock UI alone rather than risk a wrong-parent mount.
    window.setTimeout(() => {
      frameObserver.disconnect();
      if (!root.isConnected) {
        console.warn('[modernui-dashboard] div.frame not found within 5s — leaving stock UI');
      }
    }, 5000);
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
}
