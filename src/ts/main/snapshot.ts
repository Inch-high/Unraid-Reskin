import type { MainPageState } from './types';

// One-shot snapshot fetch of the /Main page state from our read-only
// main-state.php endpoint (parsed from disks.ini + var.ini). Called once on
// boot and again on each nchan-triggered resync (Task 10). Live deltas in
// between arrive via Unraid's nchan channels.
//
// operation.primary is intentionally absent from the JSON — deriveOperation()
// (the single source of truth) computes it from the raw operation fields. The
// boot/store layer applies it after fetch.

const MAIN_STATE_URL = '/plugins/unraid-modernui/include/main-state.php';

export async function fetchSnapshot(): Promise<MainPageState> {
  const res = await fetch(MAIN_STATE_URL, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`main-state.php returned ${res.status}`);
  }
  return (await res.json()) as MainPageState;
}
