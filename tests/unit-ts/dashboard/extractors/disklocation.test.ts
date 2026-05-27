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

  // Helper to flatten slots across all groups for the cross-group assertions.
  const allSlots = (tb: HTMLTableSectionElement) =>
    (disklocationExtractor.extract({ source: tb })?.groups ?? []).flatMap((g) => g.slots);

  it('extracts at least one slot', () => {
    expect(allSlots(tbody).length).toBeGreaterThan(0);
  });

  it('has a mix of occupied and empty slots', () => {
    const slots = allSlots(tbody);
    expect(slots.filter((s) => s.occupied).length).toBeGreaterThan(0);
    expect(slots.filter((s) => !s.occupied).length).toBeGreaterThan(0);
  });

  it('parses slot label from <b>N</b>', () => {
    const labels = allSlots(tbody).map((s) => s.label);
    // Slot labels are stringified numbers (e.g. "1", "2", …)
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(labels).toContain('1');
  });

  it('parses position from style="order:N"', () => {
    const positions = allSlots(tbody).map((s) => s.position);
    expect(positions.every((p) => typeof p === 'number' && p > 0)).toBe(true);
  });

  it('marks empty-state slots as not occupied', () => {
    const empty = allSlots(tbody).filter((s) => s.state === 'empty');
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((s) => !s.occupied)).toBe(true);
  });

  it('marks active-state slots as occupied', () => {
    const active = allSlots(tbody).filter((s) => s.state === 'active');
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((s) => s.occupied)).toBe(true);
  });

  it('captures inlineBgColor where present', () => {
    const withBg = allSlots(tbody).filter((s) => s.inlineBgColor !== null);
    expect(withBg.length).toBeGreaterThan(0);
  });

  it("honors the user's group names from the disklocation plugin's groups.json", () => {
    // The fixture is from a host whose groups.json names them "NVMEs" + "HDDs".
    // We must surface those names directly rather than guess "NVMe / SSD" /
    // "Drive Bays" — otherwise a user with groups like "Backup pool" or
    // "Cold storage" sees the wrong labels.
    const result = disklocationExtractor.extract({ source: tbody });
    const names = result?.groups.map((g) => g.name) ?? [];
    expect(names).toEqual(['NVMEs', 'HDDs']);
  });

  it('parses each group\'s column count from grid-template-columns', () => {
    // Fixture: NVMEs row has 4 columns, HDDs row has 15. The extractor counts
    // tokens in the inline style. A user-defined 8x2 layout would surface as
    // 8 columns here; the card uses this to grid-template the row correctly.
    const result = disklocationExtractor.extract({ source: tbody });
    const cols = result?.groups.map((g) => g.columns) ?? [];
    expect(cols).toEqual([4, 15]);
  });

  it('preserves group order as it appears in the source DOM', () => {
    // Order matters because users place groups vertically in the plugin's
    // layout editor. Our card renders them top-to-bottom in this order.
    const result = disklocationExtractor.extract({ source: tbody });
    const slotCounts = result?.groups.map((g) => g.slots.length) ?? [];
    // NVMe row first (4 slots), HDD row second (15 slots).
    expect(slotCounts).toEqual([4, 15]);
  });
});
