import type { CacheState, DiskRow } from '../types';
import type { Extractor } from './unknown';
import {
  parseDiskName,
  parseDiskState,
  parseSmart,
  parseTempCelsius,
  parseUtilization,
} from './array';

function parseHeaderTotalsGB(tbody: HTMLTableSectionElement): {
  usedGB: number | null;
  totalGB: number | null;
} {
  const text = tbody.textContent ?? '';
  // Match either "504 GB used of 5.7 TB" or "1.2 TB used of 4 TB" etc.
  const m = text.match(/([\d.]+)\s*(GB|TB)\s+used\s+of\s+([\d.]+)\s*(GB|TB)/i);
  if (!m) return { usedGB: null, totalGB: null };
  const toGB = (v: string, unit: string): number =>
    unit.toLowerCase() === 'tb' ? Number(v) * 1024 : Number(v);
  return { usedGB: toGB(m[1], m[2]), totalGB: toGB(m[3], m[4]) };
}

function parseStatus(tbody: HTMLTableSectionElement): CacheState['status'] {
  // Header has '<span id="pool_status_N"> Status: ONLINE</span>' once the
  // websocket payload has been applied. Some layouts also embed an inline
  // ONLINE/OFFLINE label inside the disk-row status cell.
  const headerText = (tbody.querySelector('[id^="pool_status_"]')?.textContent ?? '').toLowerCase();
  const bodyText = (tbody.textContent ?? '').toLowerCase();
  const haystack = `${headerText} ${bodyText}`;
  if (/\bdegraded\b/.test(haystack)) return 'degraded';
  if (/\boffline\b/.test(haystack)) return 'offline';
  if (/\bonline\b/.test(haystack)) return 'online';
  return 'unknown';
}

function parsePoolName(tbody: HTMLTableSectionElement): string {
  // Prefer the tile-header title (e.g. "cache", "cache_apps") over the id.
  const heading = tbody.querySelector('h3.tile-header-main');
  if (heading) {
    // Strip any nested span (the Status: ... pill) from the heading text.
    const clone = heading.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('span').forEach((s) => s.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  // Fallback: derive from tbody id ("pool_list0" -> "pool0").
  const id = tbody.id;
  if (id) return id.replace(/^pool_list/, 'pool');
  return 'cache';
}

export const cacheExtractor: Extractor<CacheState> = {
  match: ({ source }) => {
    if (source.id?.startsWith('pool_list')) return true;
    if (source.classList.contains('cache')) return true;
    const titleAttr = source.getAttribute('title')?.toLowerCase() ?? '';
    if (titleAttr.includes('cache') || titleAttr.includes('pool')) return true;
    return false;
  },
  extract: ({ source }) => {
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

    const { usedGB, totalGB } = parseHeaderTotalsGB(source);

    return {
      kind: 'cache',
      poolName: parsePoolName(source),
      status: parseStatus(source),
      usedGB,
      totalGB,
      disks,
    };
  },
};
