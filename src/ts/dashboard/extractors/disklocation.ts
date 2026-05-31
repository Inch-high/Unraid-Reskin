import type {
  DisklocationState,
  DisklocationGroup,
  DiskSlot,
  DiskSlotColor,
  DiskSlotState,
} from '../types';
import type { Extractor } from './unknown';

function parseHeaderCounts(tbody: HTMLTableSectionElement): {
  assignedCount: number;
  totalCount: number;
} {
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
  if (cls.includes('yellow-orb-disklocation') || cls.includes('red-orb-disklocation'))
    return 'active';
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

// Read the user-defined group name from the wrapper preceding the
// .grid-container. The plugin renders:
//   <div style="float: left;">
//     <div style="text-align: center;"><b>NVMEs</b></div>
//     <div class="grid-container" style="grid-template-columns: auto auto auto auto;">
//       ...
// We climb to the wrapper, find its first <b>, and read its text. Returns ''
// when the plugin didn't emit a label (older versions or unnamed groups).
function parseGroupName(container: Element): string {
  const wrapper = container.parentElement;
  if (!wrapper) return '';
  // Walk wrapper's direct children — the label div is the sibling preceding
  // the .grid-container. Skip the grid-container itself.
  for (const child of Array.from(wrapper.children)) {
    if (child === container) continue;
    const b = child.querySelector('b');
    if (b?.textContent) return b.textContent.trim();
  }
  return '';
}

// Count `auto` (or any track value) tokens in `grid-template-columns`. The
// plugin emits one `auto` per user-defined column — that's how we recover
// grid_columns from groups.json without reading the JSON file. Falls back
// to 1 (single column) when the style is missing or unparseable.
function parseGroupColumns(container: Element): number {
  const style = container.getAttribute('style') ?? '';
  const m = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
  if (!m) return 1;
  // Trim, collapse whitespace, split on spaces. Each token is one column.
  const tokens = m[1].trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens.length : 1;
}

export const disklocationExtractor: Extractor<DisklocationState> = {
  match: ({ source }) => source.id === 'tblDiskLocation',
  extract: ({ source }) => {
    const { assignedCount, totalCount } = parseHeaderCounts(source);

    // One .grid-container per physical tier (e.g. HL15Rack: NVMe row + HDD
    // bays). The wrapping div carries the user's chosen group name and the
    // grid-template-columns reflects their chosen column count. Honor both
    // instead of hard-coding "biggest group = HDDs" in the card.
    const containerEls = Array.from(source.querySelectorAll('.grid-container'));
    const groups: DisklocationGroup[] = containerEls.map((container) => {
      const slotEls = Array.from(container.querySelectorAll(':scope > div'));
      const slots = slotEls.map((el) => {
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
      return {
        name: parseGroupName(container),
        columns: parseGroupColumns(container),
        slots,
      };
    });

    return {
      kind: 'disklocation',
      assignedCount,
      totalCount,
      groups,
    };
  },
};
