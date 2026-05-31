import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheExtractor } from '../../../../src/ts/dashboard/extractors/cache';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('cacheExtractor', () => {
  const tbody = loadFixture('pool_list0.html');

  it('matches the pool tbody', () => {
    expect(cacheExtractor.match({ source: tbody })).toBe(true);
  });

  it('extracts at least one cache disk', () => {
    const result = cacheExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('cache');
    expect(result?.disks.length ?? 0).toBeGreaterThan(0);
  });

  it('parses utilization on at least one disk', () => {
    const result = cacheExtractor.extract({ source: tbody });
    const withUtil = result?.disks.filter((d) => d.utilizationPct !== null);
    expect(withUtil?.length ?? 0).toBeGreaterThan(0);
  });

  it('parses a recognised status', () => {
    const result = cacheExtractor.extract({ source: tbody });
    expect(['online', 'offline', 'degraded', 'unknown']).toContain(result?.status);
  });
});
