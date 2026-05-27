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

  // Mount the overlay IMMEDIATELY rather than waiting for Unraid's Vue to
  // create <table.dashboard>. Before this change boot blocked on
  // waitForSource(5000) — the user saw 1-3 seconds of blank/stock dashboard
  // while Vue mounted, even though all our code was loaded and ready. Now we
  // render a full layout skeleton at first paint and progressively populate
  // real widgets as Unraid's data arrives.
  document.body.classList.add('modernui-dashboard-active');

  const container = document.querySelector('div.frame') || document.body;
  const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
  container.appendChild(root);

  const store = createStore();
  root.setStore(store);

  // First sync: tables may already be in the DOM (server-rendered by Unraid
  // 7.2-) or absent (Vue-rendered by 7.3). Either way the call is cheap.
  extractAll(store);

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
  attachObservers();

  // If no tables yet, wait for Vue to mount them (scoped to div.content rather
  // than document.body so we don't run querySelectorAll on every node Vue
  // creates during mount — ~10× fewer observer fires on a fresh page load).
  if (collectDashboardTables().length === 0) {
    const sourceScope = document.querySelector('div.content') || document.body;
    const tablesObserver = new MutationObserver(() => {
      if (collectDashboardTables().length > 0) {
        tablesObserver.disconnect();
        extractAll(store);
        attachObservers();
      }
    });
    tablesObserver.observe(sourceScope, { childList: true, subtree: true });
    // Give up after 10s. Beyond that the dashboard genuinely has no source —
    // user-visible skeleton stays so it's clear something's wrong rather than
    // looking like a deliberately empty page.
    window.setTimeout(() => tablesObserver.disconnect(), 10_000);
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
