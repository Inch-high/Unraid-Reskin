import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrayExtractor } from '../../../../src/ts/dashboard/extractors/array';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('arrayExtractor', () => {
  const tbody = loadFixture('array_list.html');

  it('matches the array tbody', () => {
    expect(arrayExtractor.match({ source: tbody })).toBe(true);
  });

  it('extracts at least one disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('array');
    expect((result?.disks.length ?? 0)).toBeGreaterThan(0);
  });

  it('detects parity disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    const parity = result?.disks.find((d) => d.name.toLowerCase().includes('parity'));
    expect(parity).toBeDefined();
  });

  it('parses utilization on at least one disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    const withUtil = result?.disks.filter((d) => d.utilizationPct !== null);
    expect((withUtil?.length ?? 0)).toBeGreaterThan(0);
  });
});
