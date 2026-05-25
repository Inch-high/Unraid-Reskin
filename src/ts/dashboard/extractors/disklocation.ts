import type { DisklocationState, DiskSlot, DiskSlotColor, DiskSlotState } from '../types';
import type { Extractor } from './unknown';

function parseHeaderCounts(tbody: HTMLTableSectionElement): { assignedCount: number; totalCount: number } {
  const text = tbody.textContent ?? '';
  const m = text.match(/(\d+)\s+of\s+(\d+)/);
  if (!m) return { assignedCount: 0, totalCount: 0 };
  return { assignedCount: Number(m[1]), totalCount: Number(m[2]) };
}

// The disklocation plugin uses orb-class combinations to encode three slot states:
//   green-orb-disklocation                            → active   (drive spinning, normal operation)
//   grey-orb-disklocation + green-blink-disklocation  → standby  (drive assigned but spun-down)
//   grey-orb-disklocation alone                       → empty    (no drive in this bay)
function parseSlotState(slotEl: Element): DiskSlotState {
  const orb = slotEl.querySelector('i.orb-disklocation, i[class*="orb-disklocation"]');
  if (!orb) return 'empty';
  const cls = orb.className;
  if (cls.includes('green-orb-disklocation')) return 'active';
  if (cls.includes('green-blink-disklocation')) return 'standby';
  if (cls.includes('yellow-orb-disklocation') || cls.includes('red-orb-disklocation')) return 'active';
  return 'empty';
}

function parseOrbColor(slotEl: Element): DiskSlotColor {
  const orb = slotEl.querySelector('i.orb-disklocation, i[class*="orb-disklocation"]');
  if (!orb) return 'grey';
  const cls = orb.className;
  if (cls.includes('green-orb-disklocation')) return 'green';
  if (cls.includes('yellow-orb-disklocation')) return 'yellow';
  if (cls.includes('red-orb-disklocation')) return 'red';
  if (cls.includes('blue-orb-disklocation')) return 'blue';
  return 'grey';
}

function parseDiskName(slotEl: Element): string | null {
  const link = slotEl.querySelector('a[href*="/Main/Device?name="]');
  const href = link?.getAttribute('href') ?? '';
  const m = href.match(/name=([^&]+)/);
  return m ? m[1] : null;
}

function parsePosition(slotEl: Element): number {
  const style = slotEl.getAttribute('style') ?? '';
  const m = style.match(/order\s*:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

function parseLabel(slotEl: Element): string {
  // The slot number is rendered inside the "flex-container-end" wrapper as <b>N</b>.
  const endBlock = slotEl.querySelector('.flex-container-end');
  const b = endBlock?.querySelector('b') ?? slotEl.querySelector('b');
  return b?.textContent?.trim() ?? '';
}

function parseInlineBgColor(slotEl: Element): string | null {
  // The inner box that carries background-color is the first descendant div with an inline
  // background-color style (e.g. "background-color: #5B7845;" or "#303030;" for empty).
  const inner = slotEl.querySelector('div[style*="background-color"]');
  if (!inner) return null;
  const style = inner.getAttribute('style') ?? '';
  const m = style.match(/background-color\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : null;
}

export const disklocationExtractor: Extractor<DisklocationState> = {
  match: ({ source }) => source.id === 'tblDiskLocation',
  extract: ({ source }) => {
    const { assignedCount, totalCount } = parseHeaderCounts(source);

    // One .grid-container per physical tier (NVMe row + HDD bays on HL15).
    // Keep them as separate groups so the card can render each as its own row.
    const containerEls = Array.from(source.querySelectorAll('.grid-container'));
    const groups: DiskSlot[][] = containerEls.map((container) => {
      const slotEls = Array.from(container.querySelectorAll(':scope > div'));
      return slotEls.map((el) => {
        const state = parseSlotState(el);
        return {
          position: parsePosition(el),
          occupied: state !== 'empty',
          orbColor: parseOrbColor(el),
          state,
          diskName: parseDiskName(el),
          label: parseLabel(el),
          inlineBgColor: parseInlineBgColor(el),
        };
      });
    });

    return {
      kind: 'disklocation',
      assignedCount,
      totalCount,
      groups,
    };
  },
};
