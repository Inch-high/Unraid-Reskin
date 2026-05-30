import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUpdateProgressStore, parseBytesField, selectPanelView } from '../../../src/ts/docker/update-progress';
import type { UpdateProgress } from '../../../src/ts/docker/update-progress';

// Build the same nchan payloads stock update_container.php publishes. The
// protocol is "<cmd>\0<arg1>\0<arg2>" with NUL separators. Helpers below
// construct them so the tests read like the actual stream.
const addLog   = (html: string): string => `addLog\0${html}`;
const progress = (id: string, text: string): string => `progress\0${id}\0${text}`;
const DONE     = '_DONE_';

const LEGEND_PULL  = (image: string): string =>
  `<fieldset class='docker'><legend>Pulling image: ${image}</legend><p></p></fieldset>`;
const LEGEND_STOP  = (name: string): string =>
  `<fieldset class='docker'><legend>Stopping container: ${name}</legend></fieldset>`;
const LEGEND_EXEC  = `<fieldset class='docker'><legend>Command execution</legend></fieldset>`;

const resolveTo = (table: Record<string, string>) => (image: string): string | null => table[image] ?? null;

describe('parseBytesField', () => {
  it('parses common docker size formats', () => {
    expect(parseBytesField('200 MB')).toBe(200_000_000);
    expect(parseBytesField('1.5 GiB')).toBeCloseTo(1.5 * 1024 ** 3, 2);
    expect(parseBytesField(' 45% of 25 MiB')).toBeCloseTo(25 * 1024 ** 2, 2);
    expect(parseBytesField('garbage')).toBe(0);
  });
});

describe('update-progress store — message parsing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    try { sessionStorage.removeItem('modernui-docker-update-progress'); } catch {}
  });
  afterEach(() => { vi.useRealTimers(); });

  it('idle: no active progress until a Pulling image: log lands', () => {
    const store = createUpdateProgressStore(resolveTo({}));
    expect(store.getActive()).toBeNull();
    store.handleMessage(progress('abc', ' 45% of 100 MB'));
    // progress with no prior addLog → ignored (no active container).
    expect(store.getActive()).toBeNull();
  });

  it('Pulling image: starts a session and resolves container name from image', () => {
    const store = createUpdateProgressStore(resolveTo({ 'lscr.io/linuxserver/plex:latest': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('lscr.io/linuxserver/plex:latest')));
    const a = store.getActive();
    expect(a).not.toBeNull();
    expect(a!.name).toBe('plex');
    expect(a!.image).toBe('lscr.io/linuxserver/plex:latest');
    expect(a!.phase).toBe('pulling');
    expect(a!.percent).toBe(0);
  });

  it('aggregates percentage byte-weighted across layers (not a raw mean)', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));   // 50 MB of 100 MB
    store.handleMessage(progress('b', ' 100% of 50 MB'));   // 50 MB of 50 MB
    const a = store.getActive()!;
    // Byte-weighted: 100 MB downloaded / 150 MB total = 66.7% (a raw mean of
    // the two layer percents would wrongly read 75%).
    expect(a.percent).toBeCloseTo(66.67, 1);
    expect(a.totalBytes).toBeCloseTo(150_000_000, 0);
    expect(a.downloadedBytes).toBeCloseTo(100_000_000, 0);  // 50 + 50
  });

  it('byte-weighted percent reflects real total when a fresh layer joins', () => {
    // A raw mean lurches when layers interleave: layer a at 80% reads 80%,
    // then layer b appears at 0% and a mean would collapse to 40% regardless
    // of layer sizes. Byte-weighting ties the figure to actual bytes moved.
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 80% of 100 MB'));
    expect(store.getActive()!.percent).toBeCloseTo(80, 1);
    store.handleMessage(progress('b', ' 0% of 100 MB'));
    // 80 MB / 200 MB = 40% — the true fraction of bytes downloaded.
    expect(store.getActive()!.percent).toBeCloseTo(40, 1);
  });

  it('computes download speed from byte deltas over the rolling window', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));

    vi.setSystemTime(1000);
    store.handleMessage(progress('a', ' 10% of 100 MB'));    // 10 MB at t=1.0
    expect(store.getActive()!.speedBps).toBeNull();          // one sample

    vi.setSystemTime(2000);
    store.handleMessage(progress('a', ' 50% of 100 MB'));    // 50 MB at t=2.0
    const a = store.getActive()!;
    expect(a.speedBps).not.toBeNull();
    // (50 - 10) MB / 1s ≈ 40 MB/s
    expect(a.speedBps!).toBeCloseTo(40_000_000, -5);
  });

  it('switches phase to recreating when stop/run legend appears', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 100% of 100 MB'));
    expect(store.getActive()!.phase).toBe('pulling');

    store.handleMessage(addLog(LEGEND_STOP('plex')));
    expect(store.getActive()!.phase).toBe('recreating');
    expect(store.getActive()!.percent).toBe(100);
    // Speed is null during recreating — no byte rate to estimate.
    expect(store.getActive()!.speedBps).toBeNull();

    store.handleMessage(addLog(LEGEND_EXEC));
    expect(store.getActive()!.phase).toBe('recreating');
  });

  it('Pulling image for a second container resets state', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex', 'sonarr': 'sonarr' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));

    store.handleMessage(addLog(LEGEND_PULL('sonarr')));
    const a = store.getActive()!;
    expect(a.name).toBe('sonarr');
    expect(a.image).toBe('sonarr');
    expect(a.percent).toBe(0);
    expect(a.totalBytes).toBe(0);
  });

  it('_DONE_ clears active state', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));
    expect(store.getActive()).not.toBeNull();
    store.handleMessage(DONE);
    expect(store.getActive()).toBeNull();
  });

  it('chunked downloads (no "% of" suffix) still produce non-zero progress', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    // Stock script's else-branch: just a bytes value, no percentage.
    store.handleMessage(progress('a', '45 MB'));
    const a = store.getActive()!;
    expect(a.percent).toBe(100); // no known total → mean fallback; best we can do
    expect(a.totalBytes).toBeCloseTo(45_000_000, 0);
  });

  it('chunked downloads keep advancing their byte count on each chunk', () => {
    // Regression: guarding on the layer (not the message) froze a chunked
    // layer after its first chunk — every later "N MB" was dropped, so the
    // byte total and speed estimate stalled.
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', '45 MB'));
    expect(store.getActive()!.totalBytes).toBeCloseTo(45_000_000, 0);
    store.handleMessage(progress('a', '90 MB'));
    expect(store.getActive()!.totalBytes).toBeCloseTo(90_000_000, 0);
    store.handleMessage(progress('a', '135 MB'));
    expect(store.getActive()!.downloadedBytes).toBeCloseTo(135_000_000, 0);
  });

  it('a chunked layer does not inflate the % of known-total layers', () => {
    // Mixed pull: one real layer at 25%, plus a chunked layer with no total.
    // The chunked layer must be excluded from the byte-weighted percentage
    // (it would otherwise read as a permanent 100% and drag the figure up).
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 25% of 200 MB'));   // known: 50 MB / 200 MB
    store.handleMessage(progress('b', '90 MB'));            // chunked, no total
    // Percent reflects only the known layer: 50 MB / 200 MB = 25%.
    expect(store.getActive()!.percent).toBeCloseTo(25, 1);
  });

  it('ignores unknown commands and malformed payloads', () => {
    const store = createUpdateProgressStore(resolveTo({}));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage('addToID\x00abc\x00Downloading'); // ignored
    store.handleMessage('show_Wait\x00123');              // ignored — \x00 (not \0123 — strict-mode octal escape error)
    store.handleMessage('stop_Wait\x00123');              // ignored
    store.handleMessage('');                              // empty
    store.handleMessage('rawhtml-no-nul');                // no command separator
    // none of these mutate the state — active still has just the pull session
    const a = store.getActive()!;
    expect(a.image).toBe('plex');
    expect(a.percent).toBe(0);
  });

  it('subscribers fire on every state-changing message', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    const spy = vi.fn();
    store.subscribe(spy);
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));
    store.handleMessage(DONE);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('persists active state across recreate (sessionStorage round-trip)', () => {
    // Repro of the nav-away bug: session was wiped on page nav so the panel
    // showed "Queued" until the next "Pulling image:" log re-established.
    // With sessionStorage persistence, a fresh store sees the prior state.
    const store1 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store1.handleMessage(addLog(LEGEND_PULL('plex')));
    store1.handleMessage(progress('a', ' 50% of 100 MB'));
    store1.handleMessage(progress('b', ' 25% of 100 MB'));
    // Progress writes are throttled (coalesced trailing write) — flush the
    // pending timer so the latest layer state lands in sessionStorage.
    vi.runOnlyPendingTimers();

    // Simulate navigating away + back — store2 hydrates from sessionStorage.
    const store2 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    const a = store2.getActive();
    expect(a).not.toBeNull();
    expect(a!.name).toBe('plex');
    expect(a!.image).toBe('plex');
    expect(a!.phase).toBe('pulling');
    expect(a!.percent).toBeCloseTo(37.5, 1); // 75 MB / 200 MB byte-weighted
    // Speed samples reset on restore — old wall-clock timestamps are meaningless.
    expect(a!.speedBps).toBeNull();
  });

  it('_DONE_ fires onBatchComplete callback', () => {
    // Regression: panel sat on "Working…" for the full 5-min watchdog when
    // the digest cache lagged reconcile detection. _DONE_ is the canonical
    // end-of-batch signal — caller wires it to clearAllUpdating + resync.
    const onBatchComplete = vi.fn();
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }), onBatchComplete);
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));
    expect(onBatchComplete).not.toHaveBeenCalled();
    store.handleMessage(DONE);
    expect(onBatchComplete).toHaveBeenCalledTimes(1);
  });

  it('onBatchComplete does NOT fire on parse errors or unrelated messages', () => {
    const onBatchComplete = vi.fn();
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }), onBatchComplete);
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));
    store.handleMessage('rawhtml-no-nul');
    store.handleMessage('');
    expect(onBatchComplete).not.toHaveBeenCalled();
  });

  it('_DONE_ clears persisted state', () => {
    const store1 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store1.handleMessage(addLog(LEGEND_PULL('plex')));
    store1.handleMessage(progress('a', ' 50% of 100 MB'));
    store1.handleMessage(DONE);

    const store2 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    expect(store2.getActive()).toBeNull();
  });

  it('expired persisted state is discarded (>5 min)', () => {
    vi.setSystemTime(1_000_000);
    const store1 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store1.handleMessage(addLog(LEGEND_PULL('plex')));
    store1.handleMessage(progress('a', ' 50% of 100 MB'));
    // Advance past TTL.
    vi.setSystemTime(1_000_000 + 6 * 60_000);
    const store2 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    expect(store2.getActive()).toBeNull();
  });

  it('image with no matching container leaves name null but still tracks progress', () => {
    // Edge case: pull starts before docker-state.php has the container in
    // its snapshot (e.g. brand-new template). Progress still streams; just
    // no name to label it with until the next snapshot lands.
    const store = createUpdateProgressStore(resolveTo({}));
    store.handleMessage(addLog(LEGEND_PULL('linuxserver/plex:latest')));
    store.handleMessage(progress('a', ' 30% of 100 MB'));
    const a = store.getActive()!;
    expect(a.name).toBeNull();
    expect(a.image).toBe('linuxserver/plex:latest');
    expect(a.percent).toBe(30);
  });
});

describe('selectPanelView — active vs queued reconciliation', () => {
  const progress = (name: string | null): UpdateProgress => ({
    name, image: 'img', percent: 42, totalBytes: 0, downloadedBytes: 0,
    speedBps: null, phase: 'pulling',
  });

  it('no updating containers → nothing active, nothing queued', () => {
    const v = selectPanelView(new Set(), null);
    expect(v.active).toBeNull();
    expect(v.queued).toEqual([]);
  });

  it('active container present in the updating set → rendered active', () => {
    const v = selectPanelView(new Set(['plex', 'sonarr']), progress('plex'));
    expect(v.active).toEqual({ name: 'plex', data: expect.objectContaining({ name: 'plex' }) });
    expect(v.queued).toEqual(['sonarr']);
  });

  it('stale active (finished, no longer updating) is not rendered as active', () => {
    // Restored session points at "plex", but reconcileUpdating already dropped
    // it — only sonarr remains. With a single remaining container, it's
    // promoted to active (indeterminate), NOT shown as queued.
    const v = selectPanelView(new Set(['sonarr']), progress('plex'));
    expect(v.active).toEqual({ name: 'sonarr', data: expect.objectContaining({ name: 'plex' }) });
    expect(v.queued).toEqual([]);
  });

  it('stale active with multiple remaining → no active, all queued', () => {
    // active points at a finished container and there are 2+ others left, so
    // we can't guess which is active — all show as queued until a progress
    // message identifies one.
    const v = selectPanelView(new Set(['sonarr', 'radarr']), progress('plex'));
    expect(v.active).toBeNull();
    expect(v.queued.sort()).toEqual(['radarr', 'sonarr']);
  });

  it('single container, no progress data yet → promoted to active with null data', () => {
    const v = selectPanelView(new Set(['plex']), null);
    expect(v.active).toEqual({ name: 'plex', data: null });
    expect(v.queued).toEqual([]);
  });

  it('active container excluded from the queued list', () => {
    const v = selectPanelView(new Set(['plex', 'sonarr', 'radarr']), progress('sonarr'));
    expect(v.active?.name).toBe('sonarr');
    expect(v.queued.sort()).toEqual(['plex', 'radarr']);
  });
});
