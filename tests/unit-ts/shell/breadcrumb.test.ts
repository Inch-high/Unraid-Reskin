import { describe, it, expect } from 'vitest';
import { pathToBreadcrumb } from '../../../src/ts/shell/breadcrumb';
import { CURATED_NAV } from '../../../src/ts/shell/nav-builder';

describe('pathToBreadcrumb', () => {
  it('returns a single root segment for "/"', () => {
    expect(pathToBreadcrumb('/', CURATED_NAV)).toEqual([{ label: 'Home', url: '/' }]);
  });

  it('maps /Dashboard to its curated label', () => {
    expect(pathToBreadcrumb('/Dashboard', CURATED_NAV)).toEqual([
      { label: 'Dashboard', url: '/Dashboard' },
    ]);
  });

  it('returns label hierarchy for nested curated routes', () => {
    expect(pathToBreadcrumb('/Main', CURATED_NAV)).toEqual([
      { label: 'Storage', url: undefined },
      { label: 'Main', url: '/Main' },
    ]);
  });

  it('falls back to capitalized URL segments for unknown paths', () => {
    expect(pathToBreadcrumb('/Tailscale/Status', CURATED_NAV)).toEqual([
      { label: 'Tailscale', url: '/Tailscale' },
      { label: 'Status',    url: '/Tailscale/Status' },
    ]);
  });

  it('handles deep settings paths like /Settings/Theme', () => {
    const out = pathToBreadcrumb('/Settings/Theme', CURATED_NAV);
    expect(out[0]).toEqual({ label: 'Settings', url: '/Settings' });
    expect(out[1]).toEqual({ label: 'Theme', url: '/Settings/Theme' });
  });

  it('ignores trailing slashes', () => {
    expect(pathToBreadcrumb('/Docker/', CURATED_NAV)).toEqual([
      { label: 'Docker', url: '/Docker' },
    ]);
  });
});
