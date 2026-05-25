import { createStore } from './store';
import { createSourceObserver } from './source-observer';
import { dispatch } from './extractors';
import { collectDashboardTables, collectDashboardTbodies } from './dom-walk';
import './components/md-dashboard';
import type { ModernuiDashboard } from './components/md-dashboard';

function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
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

export function boot(): void {
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
    },
    () => {
      console.warn('[modernui-dashboard] source not found; leaving stock UI');
    },
  );
}
