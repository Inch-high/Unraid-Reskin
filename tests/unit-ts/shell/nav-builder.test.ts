import { describe, it, expect } from 'vitest';
import { CURATED_NAV, buildNav } from '../../../src/ts/shell/nav-builder';

describe('CURATED_NAV baseline', () => {
  it('lists the nine spec entries in order', () => {
    const labels = CURATED_NAV.map((n) => n.label);
    expect(labels).toEqual([
      'Dashboard', 'Storage', 'Docker', 'VMs',
      'Users', 'Plugins', 'Settings', 'Tools', 'Apps',
    ]);
  });

  it('Storage is the only expandable group, with Main/Shares/Pools children', () => {
    const storage = CURATED_NAV.find((n) => n.label === 'Storage');
    expect(storage?.children?.map((c) => c.label)).toEqual(['Main', 'Shares', 'Pools']);
    expect(CURATED_NAV.filter((n) => n.children?.length).length).toBe(1);
  });

  it('Dashboard, Docker, VMs etc. carry their own URLs and no children', () => {
    const dashboard = CURATED_NAV.find((n) => n.label === 'Dashboard');
    expect(dashboard?.url).toBe('/Dashboard');
    expect(dashboard?.children).toBeUndefined();
  });
});

describe('buildNav — curated only (no auto-discovery)', () => {
  it('returns the curated tree unchanged when no anchors passed', () => {
    expect(buildNav([])).toEqual(CURATED_NAV);
  });

  it('returns the curated tree unchanged when every anchor matches a curated URL', () => {
    const anchors = [
      { href: '/Dashboard', text: 'Dashboard' },
      { href: '/Docker',    text: 'Docker' },
      { href: '/Settings',  text: 'Settings' },
    ];
    expect(buildNav(anchors)).toEqual(CURATED_NAV);
  });
});
