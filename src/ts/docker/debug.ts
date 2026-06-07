// Gated debug logging for the docker page.
//
// OFF by default — zero console noise in normal use. Enable it at runtime (no
// rebuild) by either:
//
//   • appending ?dockerdebug=1 to the /Docker URL (persists to localStorage),
//   • or running  localStorage['modernui-docker-debug'] = '1'  in the console,
//
// then reloading. Disable with ?dockerdebug=0 or
// localStorage.removeItem('modernui-docker-debug').
//
// Purpose: the "page fails to load when you navigate away and back while an
// update / check-for-updates is running" report is hard to catch live, because
// the failing window is the few seconds the stock backend spends rewriting the
// webui-info docker.json (docker-state.php answers 503 the whole time). These
// logs timestamp each snapshot fetch, its HTTP status, the SWR cache hit/miss,
// and whether the store ever left its loading state — so a single console copy
// pastes the whole boot trace.

const FLAG_KEY = 'modernui-docker-debug';

// Apply a ?dockerdebug=1/0 URL override to the persisted flag, then read it.
// Wrapped because both localStorage and URL parsing can throw (private mode,
// exotic URLs) and debug logging must never break boot.
function resolveEnabled(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get('dockerdebug');
    if (v === '1') localStorage.setItem(FLAG_KEY, '1');
    else if (v === '0') localStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

const enabled = resolveEnabled();

// Wall-clock origin for the "+N.NNs" relative stamps. Captured at module load,
// which is effectively page-boot time for this bundle.
const t0 = Date.now();

export function isDockerDebug(): boolean {
  return enabled;
}

// Emit a timestamped debug line. The relative stamp (seconds since module load)
// makes the ordering of boot → cache hydrate → resync → poll obvious at a
// glance, which is exactly what the navigate-away-during-update repro needs.
export function dlog(event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  const secs = ((Date.now() - t0) / 1000).toFixed(2).padStart(7);
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console.debug(`[modernui-docker +${secs}s] ${event}`, data);
  } else {
    // eslint-disable-next-line no-console
    console.debug(`[modernui-docker +${secs}s] ${event}`);
  }
}

// One-time banner so the user knows logging is live (and how to turn it off).
if (enabled) {
  dlog(
    'debug logging ENABLED — disable with ?dockerdebug=0 or remove the modernui-docker-debug localStorage key',
  );
}
