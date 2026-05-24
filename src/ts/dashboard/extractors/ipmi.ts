import type { IpmiState, IpmiSensor } from '../types';
import type { Extractor } from './unknown';

// Classify a sensor name into one of four heuristic groups.
// The IPMI plugin doesn't tag rows with semantic types; we infer from the
// sensor identifier text (which is operator-defined but mostly conventional).
function classify(name: string, reading: string): IpmiSensor['group'] {
  const upper = name.toUpperCase();
  if (upper.includes('TEMP')) return 'temperature';
  if (upper.includes('FAN')) return 'fan';
  // Some boards report fan readings against generic-named sensors; fall back
  // to the reading suffix as a second-chance fan detector.
  if (/RPM\s*$/i.test(reading)) return 'fan';
  if (upper.includes('VOLT')) return 'voltage';
  // V3.3, V5, V12 etc — voltage rails encoded as "V" + digit.
  if (/^V\d/.test(upper)) return 'voltage';
  return 'other';
}

// Pull the status color from the row's orb element. The IPMI plugin renders
// `<i class="fa fa-circle orb {color}-orb">` where {color} is one of
// green/yellow/red/blue/grey. Anything unrecognized falls back to grey.
function statusFromOrb(row: Element): IpmiSensor['status'] {
  const orb = row.querySelector('i.fa.fa-circle.orb');
  if (!orb) return 'grey';
  const cls = orb.className || '';
  if (/\bgreen-orb\b/.test(cls)) return 'green';
  if (/\byellow-orb\b/.test(cls)) return 'yellow';
  if (/\bred-orb\b/.test(cls)) return 'red';
  if (/\bblue-orb\b/.test(cls)) return 'blue';
  return 'grey';
}

// Extract the human-readable sensor name. The IPMI plugin nests a span inside
// the `.w36` cell (the column that lists sensor identifiers). We prefer the
// inner span's text; if the structure is flatter we fall back to the cell text.
function sensorNameFrom(row: Element): string {
  const w36 = row.querySelector('span.w36');
  if (!w36) return '';
  const inner = w36.querySelector('span');
  const raw = (inner?.textContent ?? w36.textContent ?? '').replace(/\s+/g, ' ').trim();
  return raw;
}

// Extract the reading text. The plugin still emits a deprecated `<font color="">`
// inside `.reading`; we use the font element when present and fall back to the
// outer span otherwise.
function readingFrom(row: Element): string {
  const reading = row.querySelector('span.reading');
  if (!reading) return '';
  const font = reading.querySelector('font');
  const raw = (font?.textContent ?? reading.textContent ?? '').replace(/\s+/g, ' ').trim();
  return raw;
}

export const ipmiExtractor: Extractor<IpmiState> = {
  match: ({ source }) => source.id === 'tblIPMIDash',
  extract: ({ source }) => {
    const sensors: IpmiSensor[] = [];
    const rows = Array.from(source.querySelectorAll(':scope > tr'));
    for (const row of rows) {
      // Skip the title row (the first <tr> with the IPMI tile header) and the
      // column header row (`tr.header`). Data rows have neither.
      if (row.classList.contains('header')) continue;
      if (row.querySelector(':scope > td > span.tile-header')) continue;

      // Only rows that contain a `.reading` span are sensor rows.
      const reading = readingFrom(row);
      const name = sensorNameFrom(row);
      if (!name && !reading) continue;
      // Defence in depth: also skip rows whose first cell is the tile chrome.
      if (!row.querySelector('span.w36') && !row.querySelector('span.reading')) continue;

      sensors.push({
        name,
        reading,
        status: statusFromOrb(row),
        group: classify(name, reading),
      });
    }
    return { kind: 'ipmi', sensors };
  },
};
