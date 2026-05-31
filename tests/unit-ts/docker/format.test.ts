import { describe, it, expect } from 'vitest';
import { formatBytes, formatPercent, formatMac } from '../../../src/ts/docker/format';

describe('formatBytes', () => {
  it('handles null/undefined/NaN with em dash', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('renders zero without decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('picks an appropriate unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1.5 * 1024)).toBe('1.5 KiB');
    expect(formatBytes(222464305)).toBe('212.2 MiB'); // the real binhex-plexpass SizeRw
    expect(formatBytes(8 * 1024 ** 3)).toBe('8.0 GiB');
  });

  it('respects custom precision', () => {
    expect(formatBytes(1.234 * 1024 ** 2, 2)).toBe('1.23 MiB');
    expect(formatBytes(1.234 * 1024 ** 2, 0)).toBe('1 MiB');
  });
});

describe('formatPercent', () => {
  it('handles missing values', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('rounds at default precision', () => {
    expect(formatPercent(12.3456)).toBe('12.3%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('respects custom precision', () => {
    expect(formatPercent(12.3456, 0)).toBe('12%');
    expect(formatPercent(12.3456, 2)).toBe('12.35%');
  });
});

describe('formatMac', () => {
  it('lowercases for consistent display', () => {
    expect(formatMac('EE:5D:0A:C9:5E:90')).toBe('ee:5d:0a:c9:5e:90');
  });

  it('returns em dash when missing', () => {
    expect(formatMac(null)).toBe('—');
    expect(formatMac('')).toBe('—');
    expect(formatMac(undefined)).toBe('—');
  });
});
