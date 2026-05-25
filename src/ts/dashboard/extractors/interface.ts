import type { InterfaceState, NetworkInterface } from '../types';
import type { Extractor } from './unknown';

function textOf(root: Element, selector: string): string {
  const el = root.querySelector(selector);
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseInterfaces(source: HTMLTableSectionElement): NetworkInterface[] {
  // The General-info view (view1) emits one <tr class="view1"> per interface,
  // each with <span class="w26">name</span><span class="w72" id="mainN"></span>.
  // We walk these rows; #mainN starts empty in the cold template (JS fills it).
  const rows = Array.from(source.querySelectorAll('tr.view1'));
  const out: NetworkInterface[] = [];
  for (const row of rows) {
    const name = textOf(row, 'span.w26');
    if (!name) continue;
    const mainText = textOf(row, 'span.w72');
    out.push({ name, mainText });
  }
  return out;
}

function parseSelectedName(source: HTMLTableSectionElement): string {
  const select = source.querySelector('select[name="port_select"]');
  if (!select) return '';
  const selected = select.querySelector('option[selected]');
  if (selected) {
    const text = (selected.textContent ?? '').trim();
    if (text) return text;
    return (selected.getAttribute('value') ?? '').trim();
  }
  const first = select.querySelector('option');
  if (!first) return '';
  const val = first.getAttribute('value');
  if (val) return val.trim();
  return (first.textContent ?? '').trim();
}

export const interfaceExtractor: Extractor<InterfaceState> = {
  match: ({ source }) => {
    const title = source.getAttribute('title') ?? '';
    if (/interface/i.test(title)) return true;
    if (source.querySelector('select[name="port_select"]')) return true;
    const h3 = source.querySelector('h3')?.textContent ?? '';
    if (/interface/i.test(h3)) return true;
    if ((source.id || '').includes('tblNet')) return true;
    return false;
  },
  extract: ({ source }) => {
    return {
      kind: 'interface',
      interfaces: parseInterfaces(source),
      selectedName: parseSelectedName(source),
      inboundText: textOf(source, '#inbound'),
      outboundText: textOf(source, '#outbound'),
    };
  },
};
