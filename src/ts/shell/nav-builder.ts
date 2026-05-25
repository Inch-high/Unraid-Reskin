export interface NavItem {
  label: string;
  url?: string;
  children?: NavItem[];
  icon?: string;
}

export interface StockAnchor {
  href: string;
  text: string;
}

export const CURATED_NAV: NavItem[] = [
  { label: 'Dashboard', url: '/Dashboard', icon: 'dashboard' },
  { label: 'Storage', icon: 'storage', children: [
    { label: 'Main',   url: '/Main' },
    { label: 'Shares', url: '/Shares' },
  ] },
  { label: 'Docker',   url: '/Docker',   icon: 'docker' },
  { label: 'VMs',      url: '/VMs',      icon: 'vms' },
  { label: 'Users',    url: '/Users',    icon: 'users' },
  { label: 'Plugins',  url: '/Plugins',  icon: 'plugin' },
  { label: 'Settings', url: '/Settings', icon: 'settings' },
  { label: 'Tools',    url: '/Tools',    icon: 'tools' },
  { label: 'Apps',     url: '/Apps',     icon: 'apps' },
];

function flattenCuratedUrls(tree: NavItem[]): Set<string> {
  const out = new Set<string>();
  for (const node of tree) {
    if (node.url) out.add(node.url);
    if (node.children) for (const c of flattenCuratedUrls(node.children)) out.add(c);
  }
  return out;
}

export function buildNav(anchors: StockAnchor[]): NavItem[] {
  const known = flattenCuratedUrls(CURATED_NAV);
  const unknowns = anchors.filter((a) => a.href && !known.has(a.href));
  if (unknowns.length === 0) return [...CURATED_NAV];
  return [
    ...CURATED_NAV,
    { label: 'Other', icon: 'other', children: unknowns.map((a) => ({
      label: a.text.trim() || a.href,
      url: a.href,
    })) },
  ];
}
