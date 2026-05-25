import type { IdentityState } from '../types';
import type { Extractor } from './unknown';

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseServerName(tbody: HTMLTableSectionElement): string {
  const h3 = tbody.querySelector('h3.tile-header-main');
  return collapse(h3?.textContent ?? '');
}

function parseDescription(tbody: HTMLTableSectionElement): string {
  const section = tbody.querySelector('.section');
  if (!section) return '';
  const spans = Array.from(section.querySelectorAll('span'));
  for (const sp of spans) {
    if (sp.closest('h3')) continue;
    const text = collapse(sp.textContent ?? '');
    if (text.length > 0) return text;
  }
  return '';
}

function parseBetweenHeaders(leftside: Element, start: string, end: string): string {
  const text = leftside.textContent ?? '';
  const re = new RegExp(`${start}\\s*([\\s\\S]*?)${end}`);
  const m = text.match(re);
  if (!m) return '';
  return collapse(m[1]);
}

function parseModel(tbody: HTMLTableSectionElement): string {
  const leftside = tbody.querySelector('.leftside');
  if (!leftside) return '';
  return parseBetweenHeaders(leftside, 'Model', 'Registration');
}

function parseRegistration(tbody: HTMLTableSectionElement): string {
  const leftside = tbody.querySelector('.leftside');
  if (!leftside) return '';
  return parseBetweenHeaders(leftside, 'Registration', 'Uptime');
}

function parseUptime(tbody: HTMLTableSectionElement): string {
  const span = tbody.querySelector('span.uptime');
  return collapse(span?.textContent ?? '');
}

function parseCaseClass(tbody: HTMLTableSectionElement): string | null {
  const icon = tbody.querySelector('i#mycase');
  if (!icon) return null;
  const cls = icon.className.trim();
  return cls.length > 0 ? cls : null;
}

export const identityExtractor: Extractor<IdentityState> = {
  match: ({ source }) => {
    if (!source.classList.contains('system')) return false;
    return source.querySelector('.tile-select-case') !== null;
  },
  extract: ({ source }) => ({
    kind: 'identity',
    serverName: parseServerName(source),
    description: parseDescription(source),
    model: parseModel(source),
    registration: parseRegistration(source),
    uptimeText: parseUptime(source),
    caseClass: parseCaseClass(source),
  }),
};
