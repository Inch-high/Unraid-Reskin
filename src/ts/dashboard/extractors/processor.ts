import type { ProcessorState, CoreLoad } from '../types';
import type { Extractor } from './unknown';

function parseModel(tbody: HTMLTableSectionElement): string {
  // The model string lives in the .section block, after the <h3>Processor</h3> heading.
  // Live HTML: <div class='section'><h3 class='tile-header-main'>Processor</h3>AMD EPYC 8124P 16-Core  @ 2450 MHz</div>
  const section = tbody.querySelector('.section');
  if (section) {
    // Take the section text, strip the h3 text, collapse whitespace.
    const h3 = section.querySelector('h3');
    const headerText = h3?.textContent?.trim() ?? '';
    let raw = section.textContent ?? '';
    if (headerText) raw = raw.replace(headerText, '');
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    if (collapsed.length > 0) return collapsed;
  }
  // Fallback: scan first few rows for a string ending in MHz.
  const rows = Array.from(tbody.querySelectorAll('tr'));
  for (const row of rows.slice(0, 4)) {
    const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (/MHz/i.test(text)) return text;
  }
  return '';
}

function parseCores(model: string, tbody: HTMLTableSectionElement): number {
  const m = model.match(/(\d+)-Core/i);
  if (m) return Number(m[1]);
  // Fallback: count distinct cpuN spans (each thread has a numbered span class like 'cpu0', 'cpu1').
  const spans = Array.from(tbody.querySelectorAll('span[class*="cpu"].load'));
  const indices = new Set<number>();
  for (const sp of spans) {
    for (const cls of (sp.className || '').split(/\s+/)) {
      const im = cls.match(/^cpu(\d+)$/);
      if (im) indices.add(Number(im[1]));
    }
  }
  // Threads / 2 is the physical-core count for hyperthreaded CPUs; if no HT, count is total.
  return indices.size > 0 ? indices.size : 0;
}

function parseTotalPowerW(tbody: HTMLTableSectionElement): number | null {
  const text = tbody.textContent ?? '';
  const m = text.match(/Total\s+Power:\s*([\d.]+)\s*W/i);
  return m ? Number(m[1]) : null;
}

function parseTemperatureC(tbody: HTMLTableSectionElement): number | null {
  const text = tbody.textContent ?? '';
  // Live form: "Temperature: 55°C" or with entity → DOM text is already decoded.
  const m = text.match(/Temperature:\s*(\d+)\s*°?\s*C/i);
  return m ? Number(m[1]) : null;
}

// Unraid's dashboard JS pushes a fractional width onto the .usage-disk fill
// (e.g. `style="width: 3.10652%"`) — this is the smoothed, animated bar value
// the stock UI shows. The text label next to it is rounded to an integer
// ("1%"). Prefer the fill width when present so our bars match the stock
// dashboard's "always alive" feel. Fall back to text when the fill has no
// style (which is the case for per-core spans at true idle).
function widthFromFill(el: Element | null): number | null {
  if (!el) return null;
  const style = el.getAttribute('style') ?? '';
  const m = style.match(/width\s*:\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseOverallLoadPct(tbody: HTMLTableSectionElement): number | null {
  // Live fill width first (e.g. "width: 3.10652%") — that's the bar Unraid animates.
  const fromFill = widthFromFill(tbody.querySelector('#cpu'));
  if (fromFill !== null) return fromFill;
  // Fallback: "Overall Load:" row text, then a textContent scan.
  const rows = Array.from(tbody.querySelectorAll('tr'));
  for (const row of rows) {
    const head = row.querySelector('span.w26');
    if (head && /Overall\s+Load/i.test(head.textContent ?? '')) {
      const loadSpan = row.querySelector('span.cpu.load, span.cpu.load.resize');
      const m = loadSpan?.textContent?.match(/(\d+)\s*%/);
      if (m) return Number(m[1]);
    }
  }
  const text = tbody.textContent ?? '';
  const m = text.match(/Overall\s+Load:\s*(\d+)\s*%/i);
  return m ? Number(m[1]) : null;
}

function parseCoreLoads(tbody: HTMLTableSectionElement): CoreLoad[] {
  const out: CoreLoad[] = [];
  // First pass: discover the SMT sibling threshold. Linux numbers logical CPUs
  // such that on an N-core / 2N-thread system, indices 0..N-1 are the primary
  // threads and N..2N-1 are the SMT siblings. We figure out N by inspecting
  // each <tr.cpu_open> row's TWO load spans — the larger of the two indices
  // is the sibling.
  const rows = Array.from(tbody.querySelectorAll('tr.cpu_open, tr.cpu_close'));
  let smtSiblingMin = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const spanIndices: number[] = [];
    for (const sp of row.querySelectorAll('span[class*="cpu"].load')) {
      for (const cls of (sp.className || '').split(/\s+/)) {
        const im = cls.match(/^cpu(\d+)$/);
        if (im) { spanIndices.push(Number(im[1])); break; }
      }
    }
    if (spanIndices.length >= 2) {
      const max = Math.max(...spanIndices);
      smtSiblingMin = Math.min(smtSiblingMin, max);
    }
  }
  // If we never found a row with 2+ threads, there's no SMT — label everything "CPU N".
  const hasSmt = Number.isFinite(smtSiblingMin);

  // Second pass: emit a CoreLoad per logical CPU, labelled per its actual
  // index. The pair label from Unraid's tile ("CPU 0 - HT 16") is dropped —
  // it gave both bars in the rendered 2-column row the same name, which made
  // it impossible to tell which load belonged to which thread.
  for (const row of rows) {
    for (const sp of row.querySelectorAll('span[class*="cpu"].load')) {
      let index = -1;
      for (const cls of (sp.className || '').split(/\s+/)) {
        const im = cls.match(/^cpu(\d+)$/);
        if (im) { index = Number(im[1]); break; }
      }
      if (index < 0) continue;
      // Prefer the live fill width (#cpuN style) over the text — same reason as overall.
      const fromFill = widthFromFill(tbody.querySelector(`#cpu${index}`));
      let loadPct: number;
      if (fromFill !== null) {
        loadPct = fromFill;
      } else {
        const m = sp.textContent?.match(/(\d+)\s*%/);
        loadPct = m ? Number(m[1]) : 0;
      }
      const threadLabel = hasSmt && index >= smtSiblingMin
        ? `HT ${index}`
        : `CPU ${index}`;
      out.push({ index, threadLabel, loadPct });
    }
  }
  return out;
}

export const processorExtractor: Extractor<ProcessorState> = {
  match: ({ source }) => {
    if (source.id && source.id.startsWith('tblCpu')) return true;
    const titleAttr = source.getAttribute('title')?.toLowerCase() ?? '';
    if (titleAttr.includes('processor') || titleAttr.includes('cpu')) return true;
    const headerText = source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('PROCESSOR') || headerText.includes('CPU');
  },
  extract: ({ source }) => {
    const model = parseModel(source);
    return {
      kind: 'processor',
      model,
      cores: parseCores(model, source),
      totalPowerW: parseTotalPowerW(source),
      temperatureC: parseTemperatureC(source),
      overallLoadPct: parseOverallLoadPct(source),
      coreLoads: parseCoreLoads(source),
    };
  },
};
