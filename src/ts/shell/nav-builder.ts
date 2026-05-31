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
  {
    label: 'Storage',
    icon: 'storage',
    children: [
      { label: 'Main', url: '/Main' },
      { label: 'Shares', url: '/Shares' },
    ],
  },
  { label: 'Docker', url: '/Docker', icon: 'docker' },
  { label: 'VMs', url: '/VMs', icon: 'vms' },
  { label: 'Users', url: '/Users', icon: 'users' },
  { label: 'Plugins', url: '/Plugins', icon: 'plugin' },
  { label: 'Settings', url: '/Settings', icon: 'settings' },
  { label: 'Tools', url: '/Tools', icon: 'tools' },
  { label: 'Apps', url: '/Apps', icon: 'apps' },
];

function flattenCuratedUrls(tree: NavItem[]): Set<string> {
  const out = new Set<string>();
  for (const node of tree) {
    if (node.url) out.add(node.url);
    if (node.children) for (const c of flattenCuratedUrls(node.children)) out.add(c);
  }
  return out;
}

// True when the href would actually navigate somewhere — drops Unraid's
// dropdown/trigger anchors (href="#", "javascript:...") and unparseable
// relative paths. Without this filter "Other" picked up bare hashes (which
// rendered as a literal "#" sub-item label) and clicks on Other-in-collapsed
// mode did nothing because the first child's URL was "#".
function isNavigable(href: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (trimmed === '' || trimmed === '#') return false;
  if (trimmed.startsWith('#')) return false; // in-page anchors
  if (trimmed.toLowerCase().startsWith('javascript:')) return false;
  return true;
}

export function buildNav(anchors: StockAnchor[]): NavItem[] {
  const known = flattenCuratedUrls(CURATED_NAV);
  // Dedupe by href — Unraid's #menu sometimes carries the same path twice
  // (once as a top-level entry, once as a sub-tab), which would render
  // doubled rows under "Other".
  const seen = new Set<string>();
  const unknowns = anchors.filter((a) => {
    if (!isNavigable(a.href)) return false;
    if (known.has(a.href)) return false;
    if (seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });
  if (unknowns.length === 0) return [...CURATED_NAV];
  return [
    ...CURATED_NAV,
    {
      label: 'Other',
      icon: 'other',
      children: unknowns.map((a) => ({
        label: a.text.trim() || a.href,
        url: a.href,
      })),
    },
  ];
}
