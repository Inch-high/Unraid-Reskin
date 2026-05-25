import { describe, it, expect, beforeEach } from 'vitest';
import { shellEnabled } from '../../../src/ts/shell/boot';

describe('shellEnabled gate', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.modernuiShell;
  });

  it('returns true when the attribute is absent (failure-mode default)', () => {
    expect(shellEnabled(document)).toBe(true);
  });

  it('returns true when the attribute is "on"', () => {
    document.documentElement.dataset.modernuiShell = 'on';
    expect(shellEnabled(document)).toBe(true);
  });

  it('returns false when the attribute is "off"', () => {
    document.documentElement.dataset.modernuiShell = 'off';
    expect(shellEnabled(document)).toBe(false);
  });

  it('returns true for any other (unknown / future) value', () => {
    document.documentElement.dataset.modernuiShell = 'something-else';
    expect(shellEnabled(document)).toBe(true);
  });
});
