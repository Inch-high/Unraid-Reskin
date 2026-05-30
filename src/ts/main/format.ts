// Pure display helpers for the /Main page. Kept separate from components so
// they're unit-testable without a DOM.

// Bytes → human size. Unraid's /Main shows decimal (base-1000) units
// ("12 TB", "505 GB"), so we match that. 1 decimal place, trimmed.
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const neg = bytes < 0;
  let v = Math.abs(bytes);
  let i = 0;
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  // <10 → 1 decimal, otherwise whole-ish; drop trailing .0
  const str = v >= 100 || i === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${neg ? '-' : ''}${str} ${UNITS[i]}`;
}

// Temperature. null (spun-down / no reading) → "—".
export function formatTemp(c: number | null | undefined): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return '—';
  return `${Math.round(c)} °C`;
}

// Large counts (reads/writes/errors) → grouped digits. null → "—".
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

// Utilization percentage → "75%" / "8.9%". null → "—".
export function formatPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

// Split a disks.ini-style "MODEL_SERIAL" id on the LAST underscore. (PHP already
// splits for the snapshot; this mirrors it for any client-side id handling.)
export function splitModelSerial(id: string): { model: string; serial: string } {
  const pos = id.lastIndexOf('_');
  if (pos === -1) return { model: id, serial: '' };
  return { model: id.slice(0, pos), serial: id.slice(pos + 1) };
}
