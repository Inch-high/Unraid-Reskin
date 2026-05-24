import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disklocationExtractor } from '../../../../src/ts/dashboard/extractors/disklocation';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('disklocationExtractor', () => {
  const tbody = loadFixture('tblDiskLocation.html');

  it('matches the disklocation tbody by id', () => {
    expect(disklocationExtractor.match({ source: tbody })).toBe(true);
  });

  it('does not match a different tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(disklocationExtractor.match({ source: other })).toBe(false);
  });

  it('parses assignedCount and totalCount from the header', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('disklocation');
    expect(result?.assignedCount).toBe(18);
    expect(result?.totalCount).toBe(19);
  });

  it('extracts at least one slot', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    expect((result?.slots.length ?? 0)).toBeGreaterThan(0);
  });

  it('has a mix of occupied and empty slots', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const occupied = result?.slots.filter((s) => s.occupied) ?? [];
    const empty = result?.slots.filter((s) => !s.occupied) ?? [];
    expect(occupied.length).toBeGreaterThan(0);
    expect(empty.length).toBeGreaterThan(0);
  });

  it('parses slot label from <b>N</b>', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const labels = result?.slots.map((s) => s.label) ?? [];
    // Slot labels are stringified numbers (e.g. "1", "2", …)
    expect(labels.every((l) => l.length > 0)).toBe(true);
    // Confirm presence of a known label from the fixture
    expect(labels).toContain('1');
  });

  it('parses position from style="order:N"', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const positions = result?.slots.map((s) => s.position) ?? [];
    expect(positions.every((p) => typeof p === 'number' && p > 0)).toBe(true);
  });

  it('marks grey-orb slots as not occupied', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const greySlots = result?.slots.filter((s) => s.orbColor === 'grey') ?? [];
    expect(greySlots.length).toBeGreaterThan(0);
    expect(greySlots.every((s) => !s.occupied)).toBe(true);
  });

  it('marks green-orb slots as occupied', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const greenSlots = result?.slots.filter((s) => s.orbColor === 'green') ?? [];
    expect(greenSlots.length).toBeGreaterThan(0);
    expect(greenSlots.every((s) => s.occupied)).toBe(true);
  });

  it('captures inlineBgColor where present', () => {
    const result = disklocationExtractor.extract({ source: tbody });
    const withBg = result?.slots.filter((s) => s.inlineBgColor !== null) ?? [];
    expect(withBg.length).toBeGreaterThan(0);
  });
});
