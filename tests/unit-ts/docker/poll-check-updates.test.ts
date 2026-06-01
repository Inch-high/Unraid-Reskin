import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CheckUpdatesStatus } from '../../../src/ts/docker/actions';

// These exercise the REAL status-poll loop (`_pollCheckUpdates`) end-to-end —
// the wiring where the original v0.8.3 regression lived: a `return` inside the
// `try` fell through to a `finally` that reset `_checkingUpdates` on the very
// first 2s tick, so the button flipped back to idle while the worker walked on.
// The pure `checkUpdatesCompleted()` decision is unit-tested separately
// (check-updates.test.ts); here we lock down the orchestration: WHEN the button
// is released, the inactivity-watchdog timing, the hidden-tab pause, and the
// snapshot refresh — none of which the pure helper can catch.

// Mock only the network-touching actions; keep the real `checkUpdatesCompleted`
// so we test the loop against the genuine decision logic.
vi.mock('../../../src/ts/docker/actions', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/ts/docker/actions')>();
  return {
    ...actual,
    getCheckUpdatesStatus: vi.fn(),
    fetchSnapshot: vi.fn(),
    checkForUpdates: vi.fn(),
  };
});

import { ModernuiDockerPage } from '../../../src/ts/docker/components/md-docker-page';
import { getCheckUpdatesStatus, fetchSnapshot } from '../../../src/ts/docker/actions';

const getStatusMock = vi.mocked(getCheckUpdatesStatus);
const fetchSnapshotMock = vi.mocked(fetchSnapshot);

const status = (over: Partial<CheckUpdatesStatus> = {}): CheckUpdatesStatus => ({
  running: false,
  finishedAt: null,
  error: null,
  ...over,
});

const EMPTY_SNAPSHOT = { containers: [], folders: [], tags: [], tagAssignments: {} } as never;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 60_000;

// Build a page with the minimal collaborators the poll loop touches, start the
// loop, and return the page + a setState spy. Cast to `any` — `_pollCheckUpdates`
// and `_checkingUpdates` are private, but driving the real method is the whole
// point (the regression was in this method, not in any public surface).
function startPoll(baselineFinishedAt: number | null) {
  const setState = vi.fn();
  // Cast to `any` to drive the private poll loop directly — the regression was
  // in this method, so testing it through the real method is the point.
  const page = new ModernuiDockerPage() as any;
  page._store = { getShowStats: () => false, setState };
  page._checkingUpdates = true;
  page._pollCheckUpdates(baselineFinishedAt);
  return { page, setState };
}

describe('_pollCheckUpdates orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getStatusMock.mockReset();
    fetchSnapshotMock.mockReset();
    fetchSnapshotMock.mockResolvedValue(EMPTY_SNAPSHOT);
    // jsdom defaults hidden=false; pin it so each test starts visible.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps the button "Checking…" across a premature running:false then a real walk', async () => {
    const baseline = 1000;
    // 1: first poll beats the worker to its lock (stale finishedAt == baseline).
    // 2-3: worker is now genuinely walking.
    // 4: walk done — fresh finishedAt, no longer running.
    getStatusMock
      .mockResolvedValueOnce(status({ running: false, finishedAt: baseline }))
      .mockResolvedValueOnce(status({ running: true }))
      .mockResolvedValueOnce(status({ running: true }))
      .mockResolvedValueOnce(status({ running: false, finishedAt: baseline + 10 }));

    const { page, setState } = startPoll(baseline);

    // Tick 1 — the exact moment the old `finally` bug fired. Button MUST stay on.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(true);
    expect(fetchSnapshotMock).not.toHaveBeenCalled();

    // Ticks 2 & 3 — worker running, still checking.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(true);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(true);

    // Tick 4 — genuine completion: release the button and refresh exactly once.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(false);
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('concludes promptly on a fast host (fresh finishedAt, never seen running)', async () => {
    // Worker finished between launch and the first poll: running:false but a
    // finishedAt newer than the baseline. Conclude on tick 1, no watchdog wait.
    getStatusMock.mockResolvedValue(status({ running: false, finishedAt: 1005 }));
    const { page } = startPoll(1000);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(false);
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('releases the button on a poll error', async () => {
    getStatusMock.mockRejectedValueOnce(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { page } = startPoll(1000);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(false);
    warn.mockRestore();
  });

  it('bails via the inactivity watchdog when the worker never establishes', async () => {
    // Worker never boots: every poll is a stale running:false. The loop must
    // keep polling until POLL_MAX_MS of no sign of life, then refresh once and
    // release — not conclude early, not poll forever.
    getStatusMock.mockResolvedValue(status({ running: false, finishedAt: 1000 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { page } = startPoll(1000);

    // Just before the watchdog window: still checking.
    await vi.advanceTimersByTimeAsync(POLL_MAX_MS - POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(true);
    expect(fetchSnapshotMock).not.toHaveBeenCalled();

    // Past the window: watchdog fires, refreshes once, releases.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(page._checkingUpdates).toBe(false);
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not let a long walk reset the watchdog into never bailing while alive', async () => {
    // A provably-alive worker (running:true every poll) must keep the button on
    // well past the 60s the old hard cap would have cut it at.
    getStatusMock.mockResolvedValue(status({ running: true }));
    const { page } = startPoll(1000);

    await vi.advanceTimersByTimeAsync(POLL_MAX_MS * 3);
    expect(page._checkingUpdates).toBe(true);
    expect(fetchSnapshotMock).not.toHaveBeenCalled();
  });

  it('a hidden tab pauses polling without tripping the watchdog', async () => {
    getStatusMock.mockResolvedValue(status({ running: false, finishedAt: 1005 }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const { page } = startPoll(1000);

    // Hidden for well over the watchdog window: must NOT poll and must NOT bail.
    await vi.advanceTimersByTimeAsync(POLL_MAX_MS * 2);
    expect(page._checkingUpdates).toBe(true);
    expect(getStatusMock).not.toHaveBeenCalled();
    expect(fetchSnapshotMock).not.toHaveBeenCalled();

    // Regain visibility: a fresh watchdog window, then conclude normally on the
    // next poll instead of an immediate stale-window bail.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(page._checkingUpdates).toBe(false);
    expect(getStatusMock).toHaveBeenCalledTimes(1);
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
