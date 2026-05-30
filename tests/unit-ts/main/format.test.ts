import { describe, it, expect } from 'vitest';
import { formatBytes, formatTemp, formatCount, formatPct, splitModelSerial } from '../../../src/ts/main/format';

describe('formatBytes', () => {
  it('renders decimal (base-1000) units like stock /Main', () => {
    expect(formatBytes(12_000_138_571_776)).toBe('12 TB');
    expect(formatBytes(505_000_000_000)).toBe('505 GB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
    expect(formatBytes(0)).toBe('0 B');
  });
  it('handles null/invalid', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('formatTemp', () => {
  it('formats and handles spun-down null', () => {
    expect(formatTemp(31)).toBe('31 °C');
    expect(formatTemp(null)).toBe('—');
  });
});

describe('formatCount', () => {
  it('groups digits, handles null', () => {
    expect(formatCount(1611274)).toBe('1,611,274');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('—');
  });
});

describe('formatPct', () => {
  it('formats integers and decimals', () => {
    expect(formatPct(75)).toBe('75%');
    expect(formatPct(8.9)).toBe('8.9%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('splitModelSerial', () => {
  it('splits on the last underscore', () => {
    expect(splitModelSerial('ST12000VN0008-2YS101_ZRT0Q2AK')).toEqual({
      model: 'ST12000VN0008-2YS101', serial: 'ZRT0Q2AK',
    });
    expect(splitModelSerial('Seagate_ZP2000GM30063_D3300D81')).toEqual({
      model: 'Seagate_ZP2000GM30063', serial: 'D3300D81',
    });
    expect(splitModelSerial('noserial')).toEqual({ model: 'noserial', serial: '' });
  });
});
