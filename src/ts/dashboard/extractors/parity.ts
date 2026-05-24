import type { ParityState, ParityStatus } from '../types';
import type { Extractor } from './unknown';

function parseStatus(tbody: HTMLTableSectionElement): ParityStatus {
  // The websocket injects '<span class=...>Parity is valid</span>' into span.parity.
  const text = tbody.textContent ?? '';
  const lower = text.toLowerCase();
  if (lower.includes('parity is valid')) return 'valid';
  if (lower.includes('parity check running') || lower.includes('parity-check running')) return 'running';
  if (tbody.querySelector('.running')) return 'running';
  if (lower.includes('parity is invalid')) return 'invalid';
  if (lower.includes('no parity disk') || lower.includes('parity is disabled')) return 'disabled';
  // Header-only state (websocket not yet applied) is still unknown.
  return 'unknown';
}

function parseLastCheckText(tbody: HTMLTableSectionElement): string | null {
  const text = tbody.textContent ?? '';
  // Capture the run-on phrase that follows "Last check completed on", stopping
  // at the next sentinel ("Duration", a newline, or end-of-string).
  const m = text.match(/Last check completed on\s+([^\n]+?)(?=\n|Duration|$)/);
  if (!m) return null;
  // Trim trailing whitespace and dangling punctuation/icons that bled through textContent.
  return m[1].replace(/[.\s]+$/, '').trim();
}

function parseDurationText(tbody: HTMLTableSectionElement): string | null {
  const text = tbody.textContent ?? '';
  const m = text.match(/Duration:\s*([^\n]+?)(?=\n|\.\s*Average|Average|$)/);
  if (!m) return null;
  return m[1].replace(/[.\s]+$/, '').trim();
}

function parseAverageSpeedMBs(tbody: HTMLTableSectionElement): number | null {
  const text = tbody.textContent ?? '';
  const m = text.match(/Average speed:\s*([\d.]+)\s*MB\/s/);
  return m ? Number(m[1]) : null;
}

function parseErrorsFound(tbody: HTMLTableSectionElement): number | null {
  const text = tbody.textContent ?? '';
  const m = text.match(/Finding\s+(\d+)\s+errors?/i);
  return m ? Number(m[1]) : null;
}

function parseScheduleEnabled(tbody: HTMLTableSectionElement): boolean {
  const text = tbody.textContent ?? '';
  return !/Scheduled parity check is disabled/i.test(text);
}

export const parityExtractor: Extractor<ParityState> = {
  match: ({ source }) => {
    if (source.id === 'tblParity') return true;
    if (source.classList.contains('parity')) return true;
    const titleAttr = source.getAttribute('title')?.toLowerCase() ?? '';
    if (titleAttr.includes('parity')) return true;
    const headerText = source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('PARITY') && !headerText.includes('VIRTUAL');
  },
  extract: ({ source }) => ({
    kind: 'parity',
    status: parseStatus(source),
    lastCheckText: parseLastCheckText(source),
    durationText: parseDurationText(source),
    averageSpeedMBs: parseAverageSpeedMBs(source),
    errorsFound: parseErrorsFound(source),
    scheduleEnabled: parseScheduleEnabled(source),
  }),
};
