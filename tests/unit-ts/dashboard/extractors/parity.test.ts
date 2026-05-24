import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parityExtractor } from '../../../../src/ts/dashboard/extractors/parity';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('parityExtractor', () => {
  const tbody = loadFixture('Parity_Information.html');

  it('matches the parity tbody', () => {
    expect(parityExtractor.match({ source: tbody })).toBe(true);
  });

  it('parses status as valid', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('parity');
    expect(result?.status).toBe('valid');
  });

  it('parses the last-check text', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.lastCheckText).toContain('Thu 21 May 2026');
  });

  it('parses the duration text', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.durationText).toContain('18 hours');
  });

  it('parses the average speed in MB/s', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.averageSpeedMBs).toBe(185.1);
  });

  it('parses errors found', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.errorsFound).toBe(0);
  });

  it('detects schedule disabled', () => {
    const result = parityExtractor.extract({ source: tbody });
    expect(result?.scheduleEnabled).toBe(false);
  });

  it('does not match a non-parity tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody title="Virtual Information"><tr><td><h3>VIRTUAL</h3></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(parityExtractor.match({ source: other })).toBe(false);
  });
});
