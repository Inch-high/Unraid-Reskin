import type { ShareRow, ShareSecurity, SharesState } from '../types';
import type { Extractor } from './unknown';

function parseSecurity(row: Element): ShareSecurity {
  const em = row.querySelector('span.w18 em');
  const raw = em?.textContent?.trim().toLowerCase() ?? '';
  if (raw === 'private') return 'private';
  if (raw === 'secure') return 'secure';
  if (raw === 'hidden') return 'hidden';
  return 'public';
}

function parseDescription(row: Element): string {
  const text = row.querySelector('span.w44')?.textContent?.trim() ?? '';
  return text === '-' ? '' : text;
}

function parseName(row: Element): string {
  return row.querySelector('span.w26 a')?.textContent?.trim() ?? '';
}

function parseStreams(row: Element): number | null {
  // The streams span has id like share0, share1, ... — the next sibling span after w18.
  const span = row.querySelector('span[id^="share"]');
  const raw = span?.textContent?.trim() ?? '';
  if (raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseHeaderCounts(source: HTMLTableSectionElement): {
  totalCount: number;
  publicSmbCount: number;
  publicNfsCount: number;
} {
  const text = source.textContent ?? '';
  const m = text.match(
    /Share count:\s*(\d+)\s*with\s*(\d+)\s*public\s*SMB\s*and\s*(\d+)\s*public\s*NFS/i,
  );
  if (!m) return { totalCount: 0, publicSmbCount: 0, publicNfsCount: 0 };
  return {
    totalCount: Number(m[1]),
    publicSmbCount: Number(m[2]),
    publicNfsCount: Number(m[3]),
  };
}

export const sharesExtractor: Extractor<SharesState> = {
  match: ({ source }) => {
    const title = source.getAttribute('title') ?? '';
    if (title.toUpperCase().includes('SHARES')) return true;
    const headerText =
      source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    if (headerText.includes('SHARES')) return true;
    return source.querySelector('select[name="enter_share"]') !== null;
  },
  extract: ({ source }) => {
    const shareRows = Array.from(source.querySelectorAll('tr.share'));
    const shares: ShareRow[] = shareRows.map((row) => ({
      name: parseName(row),
      description: parseDescription(row),
      security: parseSecurity(row),
      streams: parseStreams(row),
    }));
    const { totalCount, publicSmbCount, publicNfsCount } = parseHeaderCounts(source);
    return {
      kind: 'shares',
      shares,
      totalCount,
      publicSmbCount,
      publicNfsCount,
    };
  },
};
