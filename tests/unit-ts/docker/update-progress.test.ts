import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUpdateProgressStore, parseBytesField } from '../../../src/ts/docker/update-progress';

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

  it('aggregates percentage across layers as their mean', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    store.handleMessage(progress('a', ' 50% of 100 MB'));
    store.handleMessage(progress('b', ' 100% of 50 MB'));
    const a = store.getActive()!;
    expect(a.percent).toBeCloseTo(75, 1);   // mean of 50 and 100
    expect(a.totalBytes).toBeCloseTo(150_000_000, 0);
    expect(a.downloadedBytes).toBeCloseTo(100_000_000, 0);  // 50 + 50
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
    expect(a.percent).toBe(100); // treated as fully downloaded — best we can do
    expect(a.totalBytes).toBeCloseTo(45_000_000, 0);
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

  it('reset() force-clears active state', () => {
    const store = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store.handleMessage(addLog(LEGEND_PULL('plex')));
    expect(store.getActive()).not.toBeNull();
    store.reset();
    expect(store.getActive()).toBeNull();
  });

  it('persists active state across recreate (sessionStorage round-trip)', () => {
    // Repro of the nav-away bug: session was wiped on page nav so the panel
    // showed "Queued" until the next "Pulling image:" log re-established.
    // With sessionStorage persistence, a fresh store sees the prior state.
    const store1 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    store1.handleMessage(addLog(LEGEND_PULL('plex')));
    store1.handleMessage(progress('a', ' 50% of 100 MB'));
    store1.handleMessage(progress('b', ' 25% of 100 MB'));

    // Simulate navigating away + back — store2 hydrates from sessionStorage.
    const store2 = createUpdateProgressStore(resolveTo({ 'plex': 'plex' }));
    const a = store2.getActive();
    expect(a).not.toBeNull();
    expect(a!.name).toBe('plex');
    expect(a!.image).toBe('plex');
    expect(a!.phase).toBe('pulling');
    expect(a!.percent).toBeCloseTo(37.5, 1); // mean of 50 and 25
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
