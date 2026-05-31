import type { ArrayState, DiskRow, DiskState, SmartHealth } from '../types';
import type { Extractor } from './unknown';

export function parseDiskState(row: Element): DiskState {
  const orb = row.querySelector('i.orb, span.orb, [class*="-orb"]');
  if (!orb) return 'unknown';
  const cls = orb.className;
  if (cls.includes('green-orb') || cls.includes('green-blink')) return 'active';
  if (cls.includes('grey-orb')) return 'standby';
  if (cls.includes('yellow-orb') || cls.includes('yellow-blink')) return 'spinning-up';
  if (cls.includes('red-orb') || cls.includes('blue-orb')) return 'unmounted';
  return 'unknown';
}

export function parseTempCelsius(row: Element): number | null {
  const tempSpan = row.querySelector('span.green-text, span.orange-text, span.red-text');
  if (!tempSpan) return null;
  const m = tempSpan.textContent?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function parseSmart(row: Element): SmartHealth {
  const icon = row.querySelector('[class*="fa-thumbs"]');
  if (!icon) return 'unknown';
  const cls = icon.className;
  // Healthy: thumbs-up + green-text. Failed: thumbs-down + red-text. Warning: thumbs-down + orange-text.
  if (cls.includes('red-text')) return 'failed';
  if (cls.includes('orange-text')) return 'warning';
  if (cls.includes('fa-thumbs-o-up') || cls.includes('green-text')) return 'healthy';
  return 'unknown';
}

export function parseUtilization(row: Element): number | null {
  // Live DOM uses .usage-disk > span[style*="width"]; older layouts may use .usage-bar
  const fill = row.querySelector(
    '.usage-disk > span[style*="width"], .usage-bar > span[style*="width"]',
  );
  if (!fill) return null;
  const widthStyle = (fill as HTMLElement).getAttribute('style') ?? '';
  const m = widthStyle.match(/width\s*:\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function parseDiskName(row: Element): string {
  // Disk rows render the device name inside <span class='w26'> as an <a> link.
  const link = row.querySelector('span.w26 a');
  if (link?.textContent) return link.textContent.trim();
  // Fallback to the first cell's text.
  const firstCell = row.querySelector('td, span.w26');
  return firstCell?.textContent?.trim().split(/\s+/).slice(0, 2).join(' ') ?? '';
}

function parseHeaderTotals(tbody: HTMLTableSectionElement): {
  usedTB: number | null;
  totalTB: number | null;
} {
  const text = tbody.textContent ?? '';
  const m = text.match(/(\d+(?:\.\d+)?)\s*TB[^0-9]+(\d+(?:\.\d+)?)\s*TB/);
  if (!m) return { usedTB: null, totalTB: null };
  return { usedTB: Number(m[1]), totalTB: Number(m[2]) };
}

export const arrayExtractor: Extractor<ArrayState> = {
  match: ({ source }) => {
    if (source.classList.contains('array')) return true;
    if (source.id === 'array_list') return true;
    const headerText =
      source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('ARRAY') && !headerText.includes('VIRTUAL');
  },
  extract: ({ source }) => {
    // Disk rows are class="updated" (websocket-injected) and contain an orb icon.
    // Header rows (class="header") and the tile-header row are filtered out by the orb test.
    const diskRows = Array.from(source.querySelectorAll('tr')).filter(
      (row) => row.querySelector('.orb, [class*="-orb"]') !== null,
    );

    const disks: DiskRow[] = diskRows.map((row) => ({
      name: parseDiskName(row),
      state: parseDiskState(row),
      tempC: parseTempCelsius(row),
      smart: parseSmart(row),
      utilizationPct: parseUtilization(row),
    }));

    const { usedTB, totalTB } = parseHeaderTotals(source);

    return {
      kind: 'array',
      status: 'started',
      usedTB,
      totalTB,
      disks,
    };
  },
};
