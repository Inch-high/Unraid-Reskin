import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSnapshot } from '../../../src/ts/main/snapshot';
import type { MainPageState } from '../../../src/ts/main/types';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dir, '../../../src/ts/main/__fixtures__/main-state.sample.json'), 'utf8'),
) as MainPageState;

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchSnapshot', () => {
  it('parses a real main-state.php payload into MainPageState', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fixture,
    })));

    const s = await fetchSnapshot();
    expect(s.array.devices.length).toBe(14);
    expect(s.pools.length).toBe(1);
    expect(s.boot?.role).toBe('flash');
    expect(s.operation.mdState).toBe('STARTED');
    expect(s.operation.encryption.mode).toBe('unlocked');
    const disk1 = s.array.devices.find((d) => d.name === 'disk1');
    expect(disk1?.serial).toBe('ZRT0Q2AK');
    expect(disk1?.model).toBe('ST12000VN0008-2YS101');
    // Raw snapshot has no derived primary — deriveOperation (Task 7) adds it.
    expect(s.operation.primary).toBeUndefined();
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })));
    await expect(fetchSnapshot()).rejects.toThrow('409');
  });
});
