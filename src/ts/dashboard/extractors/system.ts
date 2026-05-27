import type { MemoryState, MemorySlice } from '../types';
import type { Extractor } from './unknown';

function parseLabel(infoAnchor: Element | null): string {
  if (!infoAnchor) return '';
  // The <a class='info'> text is like "RAM usage<span>Percent of total used memory (126 GiB)</span>".
  // Take the full anchor text and strip the nested span text to recover the outer label.
  const fullText = (infoAnchor.textContent ?? '').replace(/\s+/g, ' ').trim();
  const inner = infoAnchor.querySelector('span');
  const innerText = (inner?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (innerText && fullText.endsWith(innerText)) {
    return fullText.slice(0, fullText.length - innerText.length).trim();
  }
  // If for some reason the nested span isn't a trailing substring, just remove first match.
  if (innerText) return fullText.replace(innerText, '').trim();
  return fullText;
}

function parseDetail(infoAnchor: Element | null): string {
  if (!infoAnchor) return '';
  const inner = infoAnchor.querySelector('span');
  return (inner?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parsePercent(pieDiv: Element, index: number): number {
  // The percent text lives in <span class='sysN'>...</span> inside the pie. Cold fixtures
  // show this empty; live updates fill it with something like "42%" or "62.6%".
  const span = pieDiv.querySelector(`span.sys${index}`);
  const text = span?.textContent ?? '';
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : 0;
}

function parseUsed(pieDiv: Element, index: number): string {
  // Live updates populate <span class='varN'> with the human used amount, e.g.
  // "34.1 GiB". Cold fixtures leave this empty.
  const span = pieDiv.querySelector(`span.var${index}`);
  return (span?.textContent ?? '').trim();
}

function parseTotalFromDetail(detail: string): string {
  // detail looks like "Percent of total used memory (126 GiB)" or
  // "Percent usage of boot device (60 GiB)". Pull the last parenthesised
  // group with a size unit.
  const m = detail.match(/\(([^()]*\b(?:[KMGT]i?B|B)\b[^()]*)\)\s*$/);
  return m ? m[1].trim() : '';
}

export const systemExtractor: Extractor<MemoryState> = {
  match: ({ source }) => {
    if (source.querySelector('.tile-system-memory-charts')) return true;
    if (source.id && source.id.includes('tblSystem')) return true;
    const pies = source.querySelectorAll('div.pie');
    return pies.length > 1;
  },
  extract: ({ source }) => {
    const pies: MemorySlice[] = [];
    // Prefer pies inside the chart container if present; otherwise scan the whole tbody.
    const root: Element = source.querySelector('.tile-system-memory-charts') ?? source;
    const pieDivs = Array.from(root.querySelectorAll('div.pie'));
    for (const pie of pieDivs) {
      // The label/tooltip anchor is the sibling <a class='info'> within the same wrapper <span>.
      // Walk up to the wrapper, then find the <a class='info'>.
      const wrapper = pie.parentElement;
      const info = wrapper?.querySelector('a.info') ?? null;
      const label = parseLabel(info);
      const detail = parseDetail(info);

      // Determine the sys-index from the pie id (e.g. id='sys0' → 0).
      const idMatch = (pie.id || '').match(/sys(\d+)/);
      const index = idMatch ? Number(idMatch[1]) : pies.length;
      const percentUsed = parsePercent(pie, index);
      const used = parseUsed(pie, index);
      const total = parseTotalFromDetail(detail);

      pies.push({ label, percentUsed, detail, used, total });
    }
    return {
      kind: 'system',
      pies,
    };
  },
};
