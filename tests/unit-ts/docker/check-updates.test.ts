import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdates,
  getCheckUpdatesStatus,
  checkUpdatesCompleted,
} from '../../../src/ts/docker/actions';
import type { CheckUpdatesStatus } from '../../../src/ts/docker/actions';

// The check-for-updates client is intentionally thin (POST to start, GET to
// poll). These tests pin down the wire format so the front-end keeps lining
// up with the PHP contract.

describe('checkForUpdates / getCheckUpdatesStatus', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // CSRF token is read off window — supply something so the POST body
    // assembly doesn't blow up.
    (globalThis as { csrf_token?: string }).csrf_token = 'test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as { csrf_token?: string }).csrf_token = undefined;
  });

  it('POSTs to start, returns queued + running', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, queued: true, running: true }), { status: 200 }),
    );
    const result = await checkForUpdates();
    expect(result).toEqual({ queued: true, running: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/plugins/unraid-modernui/include/docker-check-updates.php');
    expect((init as RequestInit).method).toBe('POST');
    // CSRF token must be in the form body.
    expect((init as RequestInit).body as string).toContain('csrf_token=test-token');
  });

  it('throws on non-2xx start', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(checkForUpdates()).rejects.toThrow(/check-updates 500/);
  });

  it('throws when server reports ok:false', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'docker manager missing' }), { status: 200 }),
    );
    await expect(checkForUpdates()).rejects.toThrow(/docker manager missing/);
  });

  it('GET status returns running/finishedAt/error shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ running: false, finishedAt: 1700000000, error: null }), {
        status: 200,
      }),
    );
    const status = await getCheckUpdatesStatus();
    expect(status).toEqual({ running: false, finishedAt: 1700000000, error: null });

    const [, init] = fetchMock.mock.calls[0];
    // Default method is GET — no method should be set, and certainly no body.
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
  });

  it('GET status fills missing fields with defaults', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const status = await getCheckUpdatesStatus();
    expect(status).toEqual({ running: false, finishedAt: null, error: null });
  });
});

// The completion guard is what keeps the "Checking…" button honest: the
// detached worker is spawned async, so the first status poll can race ahead of
// it and momentarily see running:false before the worker has written its lock.
// Concluding on that would flip the button back to idle in ~2s while the real
// 40+ container walk is still going (the original bug). These pin the decision.
describe('checkUpdatesCompleted', () => {
  const status = (over: Partial<CheckUpdatesStatus> = {}): CheckUpdatesStatus => ({
    running: false,
    finishedAt: null,
    error: null,
    ...over,
  });

  it('never completes while the worker reports running', () => {
    // Even if a stale finishedAt is present, running:true wins.
    expect(checkUpdatesCompleted(status({ running: true, finishedAt: 100 }), false, 50)).toBe(
      false,
    );
    expect(checkUpdatesCompleted(status({ running: true }), true, null)).toBe(false);
  });

  it('does NOT conclude on a premature running:false before the worker is seen', () => {
    // First poll beat the worker to its lock: running:false, no fresh finishedAt
    // (matches the baseline), never saw it running → keep polling.
    expect(checkUpdatesCompleted(status({ finishedAt: 100 }), false, 100)).toBe(false);
    // No prior completion at all, worker not yet booted.
    expect(checkUpdatesCompleted(status({ finishedAt: null }), false, null)).toBe(false);
  });

  it('completes once the worker has been observed running', () => {
    expect(checkUpdatesCompleted(status({ finishedAt: 100 }), true, 100)).toBe(true);
    expect(checkUpdatesCompleted(status({ finishedAt: null }), true, null)).toBe(true);
  });

  it('completes on a fresh finishedAt even if running was never observed', () => {
    // Tiny/fast host: worker finished between two polls. finishedAt advanced
    // past the pre-launch baseline → conclude promptly instead of waiting out
    // the watchdog.
    expect(checkUpdatesCompleted(status({ finishedAt: 200 }), false, 100)).toBe(true);
    // No baseline (couldn't read it) but a finishedAt exists → trust it.
    expect(checkUpdatesCompleted(status({ finishedAt: 200 }), false, null)).toBe(true);
  });

  it('treats an unchanged finishedAt as stale, not a fresh completion', () => {
    expect(checkUpdatesCompleted(status({ finishedAt: 100 }), false, 100)).toBe(false);
    // Clock skew / equal timestamp is not "newer".
    expect(checkUpdatesCompleted(status({ finishedAt: 100 }), false, 150)).toBe(false);
  });
});
