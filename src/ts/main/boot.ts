// Boot entry for the Modern UI /Main page rebuild.
//
// Mirrors the Docker page's takeover model (see ../docker/boot.ts): the stock
// /Main `.page` files are replaced by overlays that emit a single
// `#modernui-main-root` mount point. This bundle loads on every page (via
// loader.js), exits early off-route, and only mounts when that root exists.
//
// All wiring beyond detection (store, snapshot fetch, nchan subscriptions,
// component mount) lands in later tasks (5, 6, 9, 10).

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

  // CSRF token for action POSTs, embedded by the ArrayDevices.page overlay
  // from $var['csrf_token']. Kept here so later tasks can hand it to actions.ts.
  const csrf = root.dataset.csrf ?? '';
  void csrf;

  // TODO(Task 5): create store, mount <modernui-main-page>, fetch main-state.php.
  // TODO(Task 10): subscribe to /sub/devices, /sub/mymonitor, /sub/fsState,
  //                /sub/paritymonitor, /sub/arraymonitor via the lifecycle helper.
}
