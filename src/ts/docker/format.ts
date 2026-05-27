// Display formatters for stats. Kept in one module so the row + folder-section
// + future widgets share the same conventions (KiB/MiB/GiB, % rounding, etc).

export function formatBytes(bytes: number | null | undefined, precision = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const abs = Math.abs(bytes);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(abs) / Math.log(1024)));
  const v = bytes / Math.pow(1024, exp);
  const p = exp === 0 ? 0 : precision;          // bytes show no decimals
  return `${v.toFixed(p)} ${units[exp]}`;
}

export function formatPercent(pct: number | null | undefined, precision = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct.toFixed(precision)}%`;
}

// MAC normalization for display — lower-case, colon-separated, drop any zone IDs.
export function formatMac(mac: string | null | undefined): string {
  if (!mac || typeof mac !== 'string') return '—';
  return mac.toLowerCase();
}
