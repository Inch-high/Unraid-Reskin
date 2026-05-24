import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTheme, applyTheme } from '../../src/ts/theme-init';

describe('resolveTheme', () => {
  it('returns "dark" when mode is "dark"', () => {
    expect(resolveTheme('dark', () => false)).toBe('dark');
  });

  it('returns "light" when mode is "light"', () => {
    expect(resolveTheme('light', () => true)).toBe('light');
  });

  it('returns "dark" when mode is "system" and system prefers dark', () => {
    expect(resolveTheme('system', () => true)).toBe('dark');
  });

  it('returns "light" when mode is "system" and system prefers light', () => {
    expect(resolveTheme('system', () => false)).toBe('light');
  });

  it('defaults to "dark" when mode is unknown', () => {
    expect(resolveTheme('garbage' as any, () => false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
  });

  it('sets data-theme on <html>', () => {
    applyTheme({ theme: 'dark', density: 'comfortable' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-density on <html>', () => {
    applyTheme({ theme: 'light', density: 'compact' });
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('replaces an existing data-theme rather than appending', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    applyTheme({ theme: 'dark', density: 'comfortable' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
