import { createStore } from './store';
import { createSourceObserver } from './source-observer';
import { dispatch } from './extractors';
import './components/md-dashboard';
import type { ModernuiDashboard } from './components/md-dashboard';

function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
}

function waitForSource(
  timeoutMs: number,
  onReady: (el: HTMLTableElement) => void,
  onTimeout: () => void,
): void {
  const existing = document.querySelector<HTMLTableElement>('table.dashboard');
  if (existing) {
    onReady(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const found = document.querySelector<HTMLTableElement>('table.dashboard');
    if (found) {
      observer.disconnect();
      clearTimeout(timeoutHandle);
      onReady(found);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeoutHandle = window.setTimeout(() => {
    observer.disconnect();
    onTimeout();
  }, timeoutMs);
}

function extractAll(source: HTMLTableElement, store: ReturnType<typeof createStore>): void {
  const tbodies = Array.from(source.querySelectorAll<HTMLTableSectionElement>(':scope > tbody'));
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
    (source) => {
      document.body.classList.add('modernui-dashboard-active');

      // Find or create the mount container
      const container = document.querySelector('div.frame') || document.body;
      const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
      container.appendChild(root);

      // Wire store + observer
      const store = createStore();
      root.setStore(store);

      // Initial sync
      extractAll(source, store);

      // Watch for live updates
      const obs = createSourceObserver(source, () => extractAll(source, store), 50);
      obs.start();
    },
    () => {
      console.warn('[modernui-dashboard] source not found; leaving stock UI');
    },
  );
}
