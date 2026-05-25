import { describe, it, expect } from 'vitest';
import { CURATED_NAV, buildNav, type StockAnchor } from '../../../src/ts/shell/nav-builder';

describe('CURATED_NAV baseline', () => {
  it('lists the nine spec entries in order', () => {
    const labels = CURATED_NAV.map((n) => n.label);
    expect(labels).toEqual([
      'Dashboard', 'Storage', 'Docker', 'VMs',
      'Users', 'Plugins', 'Settings', 'Tools', 'Apps',
    ]);
  });

  it('Storage is the only expandable group, with Main and Shares children', () => {
    const storage = CURATED_NAV.find((n) => n.label === 'Storage');
    expect(storage?.children?.map((c) => c.label)).toEqual(['Main', 'Shares']);
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

describe('buildNav — auto-discovery merge', () => {
  it('appends an "Other" section for anchors not in the curated tree', () => {
    const anchors: StockAnchor[] = [
      { href: '/Dashboard',  text: 'Dashboard' },          // curated
      { href: '/Tailscale',  text: 'Tailscale' },          // unknown
      { href: '/CADashboard', text: 'CA Custom Dashboard' }, // unknown
    ];
    const tree = buildNav(anchors);
    const other = tree.find((n) => n.label === 'Other');
    expect(other).toBeDefined();
    expect(other?.children?.map((c) => c.label)).toEqual(['Tailscale', 'CA Custom Dashboard']);
    expect(other?.children?.map((c) => c.url)).toEqual(['/Tailscale', '/CADashboard']);
  });

  it('treats curated sub-item URLs as "known" (Main is not duplicated into Other)', () => {
    const anchors: StockAnchor[] = [{ href: '/Main', text: 'Main' }];
    const tree = buildNav(anchors);
    expect(tree.find((n) => n.label === 'Other')).toBeUndefined();
  });

  it('falls back to the URL as label if anchor text is empty', () => {
    const anchors: StockAnchor[] = [{ href: '/Mystery', text: '' }];
    const tree = buildNav(anchors);
    const other = tree.find((n) => n.label === 'Other');
    expect(other?.children?.[0]?.label).toBe('/Mystery');
  });

  it('ignores anchors with no href', () => {
    const anchors: StockAnchor[] = [{ href: '', text: 'nope' }];
    const tree = buildNav(anchors);
    expect(tree.find((n) => n.label === 'Other')).toBeUndefined();
  });
});
