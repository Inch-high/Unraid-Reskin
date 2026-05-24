// Page detection. Returns true if we're on /Dashboard*; false otherwise.
function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
}

// Wait up to `timeoutMs` for the source table.dashboard to appear in the DOM.
// Calls `onReady` with the element once it's present, or `onTimeout` if not seen in time.
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

export function boot(): void {
  if (!onDashboardPage()) return;

  waitForSource(
    5000,
    (source) => {
      // Hide Unraid's stock dashboard by toggling a body class.
      // CSS in dashboard-overlay.scss handles the actual display:none.
      document.body.classList.add('modernui-dashboard-active');

      // Mount placeholder will come in Task 6. For now just log.
      console.log('[modernui-dashboard] booted, source detected', source);
    },
    () => {
      console.warn('[modernui-dashboard] source not found within 5s; leaving stock UI');
    },
  );
}
