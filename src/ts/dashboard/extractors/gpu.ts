import type { GpuState } from '../types';
import type { Extractor } from './unknown';

// Extract a finite number from a span's text; return null if absent or non-numeric.
function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

// Read the inner text of the first element matching a selector, trimmed and
// whitespace-collapsed. Empty string when missing.
function textOf(root: Element, selector: string): string {
  const el = root.querySelector(selector);
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// Some gpu-* classes appear on multiple elements (e.g. the header gpu-util1
// preview AND the row gpu-util1). Prefer the one inside a `.load` element on
// a data row; fall back to the first match anywhere.
function preferLoadText(root: Element, baseClass: string): string {
  // Match `.gpu-util1.load`, `.gpu-power1.load`, etc — the row-level value spans.
  const loadEl = root.querySelector(`.${baseClass}.load`);
  if (loadEl) return (loadEl.textContent ?? '').replace(/\s+/g, ' ').trim();
  return textOf(root, `.${baseClass}`);
}

function parsePciBus(tbody: HTMLTableSectionElement): string {
  // Compose a short PCIe summary from the gen + lanes spans. Either may be empty
  // in cold templates → output is "" in that case.
  const gen = textOf(tbody, '.gpu-pciegen1');
  const genMax = textOf(tbody, '.gpu-pciegenmax1');
  const width = textOf(tbody, '.gpu-pciewidth1');
  const widthMax = textOf(tbody, '.gpu-pciewidthmax1');
  const parts: string[] = [];
  if (gen) parts.push(genMax ? `Gen ${gen}/${genMax}` : `Gen ${gen}`);
  if (width) parts.push(widthMax ? `${width}/${widthMax} lanes` : `${width} lanes`);
  return parts.join(' · ');
}

function parseActiveApps(tbody: HTMLTableSectionElement): number {
  // The "Active Apps" row has class gpu-active-apps1; child spans (other than the
  // label span.w36) each represent one running application.
  const appsRow = tbody.querySelector('.gpu-active-apps1');
  if (!appsRow) return 0;
  const allSpans = Array.from(appsRow.querySelectorAll('span'));
  // Filter out the label span (w36) and any empty spans.
  const apps = allSpans.filter((sp) => {
    if (sp.classList.contains('w36')) return false;
    const t = (sp.textContent ?? '').trim();
    return t.length > 0;
  });
  return apps.length;
}

function parseThrottling(tbody: HTMLTableSectionElement): boolean {
  // The throttled span shows "No" when idle and "Yes"/"Power"/etc when throttled.
  // A non-empty value other than "No" means throttling is active.
  const t = textOf(tbody, '.gpu-throttled1');
  if (!t) return false;
  return t.toLowerCase() !== 'no';
}

export const gpuExtractor: Extractor<GpuState> = {
  match: ({ source }) => {
    if (source.id && source.id.startsWith('tblGPU')) return true;
    const cls = source.className || '';
    if (/\bgpu\b|gpu-/i.test(cls)) return true;
    return false;
  },
  extract: ({ source }) => {
    const vendor = textOf(source, '.gpu-vendor1');
    const driver = textOf(source, '.gpu-driver1');
    const model = textOf(source, '.gpu-name1');
    const pciBus = parsePciBus(source);

    const utilizationPct = parseNumber(preferLoadText(source, 'gpu-util1'));
    const memoryUsedPct = parseNumber(preferLoadText(source, 'gpu-memutil1'));
    // gpu-memclock1 carries the memory MHz value; row label is "GPU - Memory (MHz)".
    const memoryMHz = parseNumber(preferLoadText(source, 'gpu-memclock1'));
    const fanRpm = parseNumber(preferLoadText(source, 'gpu-fan1'));
    const powerW = parseNumber(preferLoadText(source, 'gpu-power1'));
    const temperatureC = parseNumber(textOf(source, '.gpu-temp1'));

    return {
      kind: 'gpu',
      model,
      vendor,
      driver,
      pciBus,
      utilizationPct,
      memoryUsedPct,
      memoryMHz,
      fanRpm,
      powerW,
      temperatureC,
      activeApps: parseActiveApps(source),
      throttling: parseThrottling(source),
    };
  },
};
