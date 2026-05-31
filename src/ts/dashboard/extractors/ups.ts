import type { UpsState, UpsStatus } from '../types';
import type { Extractor } from './unknown';

function parseFirstNumber(text: string): number | null {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function readSpanNumber(tbody: HTMLTableSectionElement, selector: string): number | null {
  const el = tbody.querySelector(selector);
  if (!el) return null;
  // Spinner-text placeholder uses an <i class="fa-spinner"> alongside an <em>; reject
  // anything that still has those markers — the live JS has not yet replaced it.
  if (el.querySelector('.fa-spinner') || el.querySelector('em')) return null;
  return parseFirstNumber(el.textContent ?? '');
}

function parseStatus(statusText: string): UpsStatus {
  const lower = statusText.toLowerCase();
  if (lower.includes('low battery')) return 'low-battery';
  if (lower.includes('replace battery')) return 'replace-battery';
  if (lower.includes('on battery')) return 'on-battery';
  if (lower.includes('on line') || lower.includes('online')) return 'on-line';
  return 'unknown';
}

function parseRuntimeMinutes(tbody: HTMLTableSectionElement): number | null {
  const el = tbody.querySelector('.nut_timeleft');
  if (!el) return null;
  if (el.querySelector('.fa-spinner') || el.querySelector('em')) return null;
  const raw = (el.textContent ?? '').trim();
  const m = raw.match(/(?:(\d+):)?(\d+):(\d+)/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const mins = Number(m[2]);
  const secs = Number(m[3]);
  const total = h * 60 + mins + secs / 60;
  return Math.round(total);
}

function parseNominal(tbody: HTMLTableSectionElement): { w: number | null; va: number | null } {
  const el = tbody.querySelector('.nut_nompower');
  if (!el) return { w: null, va: null };
  if (el.querySelector('.fa-spinner') || el.querySelector('em')) return { w: null, va: null };
  const text = el.textContent ?? '';
  const m = text.match(/(\d+)\s*W\s*\((\d+)\s*VA\)/i);
  if (!m) {
    const wOnly = text.match(/(\d+)\s*W/i);
    return { w: wOnly ? Number(wOnly[1]) : null, va: null };
  }
  return { w: Number(m[1]), va: Number(m[2]) };
}

// Read live UPS values from Unraid 7.3's <footer> .footer-right chrome.
// Unraid 7.3 stopped pushing updates into the legacy dashboard tbody — its
// .nut_loadpct / .nut_bcharge spans serve their initial values forever — but
// the new footer chrome still ticks via Vue. The sidebar uses the same source
// (cf. shell-sidebar._renderFooterRight). Returns null fields when the footer
// is absent (Unraid <7.3) or the document scope doesn't have one (tests).
function readLiveFooter(doc: Document): {
  loadW: number | null;
  batteryChargePct: number | null;
} {
  const right = doc.querySelector('footer .footer-right');
  if (!right) return { loadW: null, batteryChargePct: null };
  const text = right.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  // "65°C 60°C 187 W (300 VA) 76 %" — wattage is `<digits> W` (sometimes
  // suffixed with VA), battery is `<digits> %`. Pick the FIRST occurrence of
  // each since the text may contain other percentages downstream.
  const wMatch = text.match(/(\d+)\s*W(?:\s*\(\d+\s*VA\))?/i);
  const pctMatch = text.match(/(\d+)\s*%/);
  return {
    loadW: wMatch ? Number(wMatch[1]) : null,
    batteryChargePct: pctMatch ? Number(pctMatch[1]) : null,
  };
}

export const upsExtractor: Extractor<UpsState> = {
  match: ({ source }) => {
    if (source.id === 'tblUPSNUTDash') return true;
    const titleAttr = source.getAttribute('title')?.toUpperCase() ?? '';
    if (titleAttr.includes('UPS')) return true;
    const headerText =
      source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('UPS');
  },
  extract: ({ source }) => {
    const statusText = (source.querySelector('.nut_status')?.textContent ?? '').trim();
    const status = parseStatus(statusText);
    const tbodyBattery = readSpanNumber(source, '.nut_bcharge');
    const tbodyLoadPct = readSpanNumber(source, '.nut_loadpct');
    const runtimeMinutes = parseRuntimeMinutes(source);
    const { w: nominalPowerW, va: nominalVA } = parseNominal(source);
    const tbodyLoadW =
      tbodyLoadPct !== null && nominalPowerW !== null
        ? Math.round((tbodyLoadPct * nominalPowerW) / 100)
        : null;

    // Prefer Unraid 7.3's live <footer> .footer-right values for the fields
    // that go stale in the legacy tbody (battery%, live wattage). Falls back
    // to tbody-derived values when the footer isn't on the page (Unraid <7.3
    // or test environments). loadPct stays tbody-only — the footer reports
    // watts directly, not load %.
    const doc = (source.ownerDocument ?? globalThis.document ?? null) as Document | null;
    const live = doc ? readLiveFooter(doc) : { loadW: null, batteryChargePct: null };
    const batteryChargePct = live.batteryChargePct ?? tbodyBattery;
    const loadW = live.loadW ?? tbodyLoadW;
    // If we got live watts from the footer but no loadPct in the tbody, infer
    // it back from nominalPowerW so the UPS card's "Load" row still shows a %.
    const loadPct =
      tbodyLoadPct ??
      (live.loadW !== null && nominalPowerW !== null && nominalPowerW > 0
        ? Math.round((live.loadW / nominalPowerW) * 100)
        : null);

    // The cold UPS tbody renders spinner+<em> placeholders for every live
    // field; apcupsd / nut JS replaces them once the daemon reports. If we see
    // any of those placeholders, mark loading=true so the Power hero card can
    // show a skeleton rather than the misleading "—" / "UPS status unknown".
    const hasSpinner =
      source.querySelector('.fa-spinner') !== null || source.querySelector('em') !== null;
    const loading =
      hasSpinner &&
      status === 'unknown' &&
      batteryChargePct === null &&
      loadPct === null &&
      runtimeMinutes === null;
    return {
      kind: 'ups',
      status,
      statusText,
      batteryChargePct,
      loadPct,
      loadW,
      runtimeMinutes,
      nominalPowerW,
      nominalVA,
      loading,
    };
  },
};
