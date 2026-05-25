import type { MotherboardState } from '../types';
import type { Extractor } from './unknown';

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseBodyLines(tbody: HTMLTableSectionElement): string[] {
  const rows = tbody.querySelectorAll('tr');
  if (rows.length < 2) return [];
  const text = rows[1].textContent ?? '';
  return text
    .split('\n')
    .map((l) => collapse(l))
    .filter((l) => l.length > 0);
}

function parseBiosDated(line: string | undefined): string {
  if (!line) return '';
  return collapse(line.replace(/^BIOS dated:\s*/i, ''));
}

export const motherboardExtractor: Extractor<MotherboardState> = {
  match: ({ source }) => {
    const titleAttr = source.getAttribute('title')?.toUpperCase() ?? '';
    if (titleAttr.includes('MOTHERBOARD')) return true;
    const headerText = source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('MOTHERBOARD');
  },
  extract: ({ source }) => {
    const lines = parseBodyLines(source);
    return {
      kind: 'motherboard',
      vendor: lines[0] ?? '',
      biosVendor: lines[1] ?? '',
      biosDated: parseBiosDated(lines[2]),
    };
  },
};
