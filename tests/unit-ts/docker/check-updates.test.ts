import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdates, getCheckUpdatesStatus } from '../../../src/ts/docker/actions';

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
    delete (globalThis as { csrf_token?: string }).csrf_token;
  });

  it('POSTs to start, returns queued + running', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, queued: true, running: true }),
      { status: 200 },
    ));
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
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, error: 'docker manager missing' }),
      { status: 200 },
    ));
    await expect(checkForUpdates()).rejects.toThrow(/docker manager missing/);
  });

  it('GET status returns running/finishedAt/error shape', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ running: false, finishedAt: 1700000000, error: null }),
      { status: 200 },
    ));
    const status = await getCheckUpdatesStatus();
    expect(status).toEqual({ running: false, finishedAt: 1700000000, error: null });

    const [, init] = fetchMock.mock.calls[0];
    // Default method is GET — no method should be set, and certainly no body.
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
  });

  it('GET status fills missing fields with defaults', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({}),
      { status: 200 },
    ));
    const status = await getCheckUpdatesStatus();
    expect(status).toEqual({ running: false, finishedAt: null, error: null });
  });
});
