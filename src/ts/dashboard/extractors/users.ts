import type { UserRow, UsersState } from '../types';
import type { Extractor } from './unknown';

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function parseHeaderCounts(source: HTMLTableSectionElement): {
  totalCount: number;
  unprotectedCount: number;
} {
  const text = source.textContent ?? '';
  const m = text.match(/User count:\s*(\d+)\s*with\s*(\d+)\s*unprotected/i);
  if (!m) return { totalCount: 0, unprotectedCount: 0 };
  return { totalCount: Number(m[1]), unprotectedCount: Number(m[2]) };
}

function readUser(row: Element): UserRow {
  const name = textOf(row.querySelector('span.w26 a'));
  const descRaw = textOf(row.querySelector('span.w44'));
  const description = descRaw === '-' ? '' : descRaw;
  const writeCount = parseIntOrNull(textOf(row.querySelector('span.w18')));

  // The read cell is the final <span> inside the row's <td>. It has no class
  // (unlike the .w26 / .w44 / .w18 columns above), so we pick the last span.
  const cell = row.querySelector('td');
  const spans = cell ? Array.from(cell.querySelectorAll(':scope > span')) : [];
  const readSpan = spans.length > 0 ? spans[spans.length - 1] : null;
  const readCount = readSpan ? parseIntOrNull(textOf(readSpan)) : null;

  return { name, description, writeCount, readCount };
}

export const usersExtractor: Extractor<UsersState> = {
  match: ({ source }) => {
    const title = source.getAttribute('title') ?? '';
    if (/users/i.test(title)) return true;
    const h3 = source.querySelector('h3, .tile-header-main')?.textContent ?? '';
    if (/users/i.test(h3)) return true;
    return false;
  },
  extract: ({ source }) => {
    const rows = Array.from(source.querySelectorAll('tr.user'));
    const users = rows.map((r) => readUser(r));
    const { totalCount, unprotectedCount } = parseHeaderCounts(source);
    return {
      kind: 'users',
      users,
      totalCount,
      unprotectedCount,
    };
  },
};
