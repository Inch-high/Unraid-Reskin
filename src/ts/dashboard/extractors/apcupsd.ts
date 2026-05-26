import type { UpsState, UpsStatus } from '../types';
import type { Extractor } from './unknown';

// Stock apcupsd dashboard tile (Unraid 7.x). Unlike NUT (which has its own
// tbody id `tblUPSNUTDash` and class-based span markers `.nut_*`), the stock
// apcupsd tile is anonymous — it lives inside a `<tbody title="Power Status">`
// rendered by DashStats.page and is filled by the `ups_status` Nchan channel
// pushing into `<span id='ups_*'>` placeholders.
//
// Live value formats (from emhttp/plugins/dynamix.apcupsd/include/UPSstatus.php):
//   #ups_model     "BX1500M"
//   #ups_status    "Online" | "On battery" | "Low on battery" | "Lost communication" | …
//   #ups_bcharge   "100 %"
//   #ups_timeleft  "45 minutes"
//   #ups_nompower  "900 W"            (no separate VA — apcupsd reports only watts)
//   #ups_loadpct   "54 W (6 %)"       (calculated load + percentage)
//   #ups_outputv   "120 V ~ 60 Hz"

function parseFirstNumber(text: string): number | null {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function readSpanNumber(tbody: HTMLTableSectionElement, selector: string): number | null {
  const el = tbody.querySelector(selector);
  if (!el) return null;
  const text = (el.textContent ?? '').trim();
  if (text.length === 0) return null;
  return parseFirstNumber(text);
}

function parseStatus(statusText: string): UpsStatus {
  const lower = statusText.toLowerCase();
  // Order matters — "low on battery" must beat "on battery".
  if (lower.includes('low') && lower.includes('battery')) return 'low-battery';
  if (lower.includes('replace battery')) return 'replace-battery';
  if (lower.includes('on battery')) return 'on-battery';
  if (lower.includes('online') || lower.includes('on line')) return 'on-line';
  return 'unknown';
}

function parseRuntimeMinutes(tbody: HTMLTableSectionElement): number | null {
  const el = tbody.querySelector('#ups_timeleft');
  if (!el) return null;
  const text = (el.textContent ?? '').trim();
  if (text.length === 0) return null;
  // apcupsd always reports an integer count of minutes via UPSstatus.php
  // (`round(strtok($val,' '))` then suffixed with " minutes" / _('minutes')).
  // Translations may swap the unit word; we only rely on the leading number.
  return parseFirstNumber(text);
}

function parseLoad(tbody: HTMLTableSectionElement): { loadPct: number | null; loadW: number | null } {
  const el = tbody.querySelector('#ups_loadpct');
  if (!el) return { loadPct: null, loadW: null };
  const text = (el.textContent ?? '').trim();
  if (text.length === 0) return { loadPct: null, loadW: null };
  // Combined form when nominal power is known: "54 W (6 %)"
  const combined = text.match(/(\d+(?:\.\d+)?)\s*W\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/i);
  if (combined) {
    return { loadW: Number(combined[1]), loadPct: Number(combined[2]) };
  }
  // Percentage only when nominal power is unset: "6 %"
  const pctOnly = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctOnly) {
    return { loadPct: Number(pctOnly[1]), loadW: null };
  }
  // Watts only (defensive — UPSstatus.php doesn't currently emit this form)
  const wOnly = text.match(/(\d+(?:\.\d+)?)\s*W/i);
  if (wOnly) {
    return { loadW: Number(wOnly[1]), loadPct: null };
  }
  return { loadPct: null, loadW: null };
}

function parseNominalPower(tbody: HTMLTableSectionElement): number | null {
  const el = tbody.querySelector('#ups_nompower');
  if (!el) return null;
  const text = (el.textContent ?? '').trim();
  if (text.length === 0) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*W/i);
  return m ? Number(m[1]) : parseFirstNumber(text);
}

export const apcupsdExtractor: Extractor<UpsState> = {
  match: ({ source }) => {
    // The strongest signal is the `<span id='ups_status'>` placeholder pair
    // alongside `<span id='ups_model'>`. The tbody title ("Power Status") and
    // header ("Power") are both translation-localized and unreliable cross-locale.
    const hasUpsStatusSpan = source.querySelector('#ups_status') !== null;
    const hasUpsModelSpan = source.querySelector('#ups_model') !== null;
    if (hasUpsStatusSpan && hasUpsModelSpan) return true;
    // English fallbacks (defensive; covered by the span check above on stock 7.x).
    const titleAttr = source.getAttribute('title')?.toUpperCase() ?? '';
    if (titleAttr.includes('POWER STATUS')) return true;
    return false;
  },
  extract: ({ source }) => {
    const statusEl = source.querySelector('#ups_status');
    const statusText = (statusEl?.textContent ?? '').trim();
    const status = parseStatus(statusText);
    const batteryChargePct = readSpanNumber(source, '#ups_bcharge');
    const { loadPct, loadW: parsedLoadW } = parseLoad(source);
    const runtimeMinutes = parseRuntimeMinutes(source);
    const nominalPowerW = parseNominalPower(source);
    // If UPSstatus.php gave us only the percentage (no watts in the load cell)
    // but we know nominal power, synthesize watts the same way the NUT extractor
    // does — keeps the card's "X W" readout consistent across plugins.
    const loadW =
      parsedLoadW !== null
        ? parsedLoadW
        : loadPct !== null && nominalPowerW !== null
          ? Math.round((loadPct * nominalPowerW) / 100)
          : null;
    return {
      kind: 'ups',
      status,
      statusText,
      batteryChargePct,
      loadPct,
      loadW,
      runtimeMinutes,
      nominalPowerW,
      // apcupsd does not expose VA separately (UPSstatus.php only emits W).
      nominalVA: null,
    };
  },
};
