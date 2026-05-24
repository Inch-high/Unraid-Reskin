import { describe, it, expect } from 'vitest';
import { isUrlOverrideOff, isClientReady } from '../../src/ts/fallback';

describe('isUrlOverrideOff', () => {
  it('returns true when modernui=off is in the URL', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=off')).toBe(true);
  });

  it('returns false when modernui=on', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=on')).toBe(false);
  });

  it('returns false when modernui param is absent', () => {
    expect(isUrlOverrideOff('https://tower/Main')).toBe(false);
  });

  it('returns true for modernui=OFF (case-insensitive)', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=OFF')).toBe(true);
  });
});

describe('isClientReady', () => {
  it('returns true when document.body exists', () => {
    expect(isClientReady(document)).toBe(true);
  });
});
