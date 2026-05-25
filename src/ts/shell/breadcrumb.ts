import type { NavItem } from './nav-builder';

export interface BreadcrumbSegment {
  label: string;
  url: string | undefined;
}

function findInTree(tree: NavItem[], url: string): { node: NavItem; parent?: NavItem } | null {
  for (const node of tree) {
    if (node.url === url) return { node };
    if (node.children) {
      for (const child of node.children) {
        if (child.url === url) return { node: child, parent: node };
      }
    }
  }
  return null;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function pathToBreadcrumb(pathname: string, tree: NavItem[]): BreadcrumbSegment[] {
  const path = pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') return [{ label: 'Home', url: '/' }];

  // Try a direct curated match first — Storage children give us a parent label.
  const direct = findInTree(tree, path);
  if (direct) {
    if (direct.parent) {
      return [
        { label: direct.parent.label, url: direct.parent.url },
        { label: direct.node.label, url: direct.node.url },
      ];
    }
    return [{ label: direct.node.label, url: direct.node.url }];
  }

  // Otherwise split + capitalize, accumulating URLs as we go.
  const parts = path.split('/').filter(Boolean);
  const out: BreadcrumbSegment[] = [];
  let acc = '';
  for (const part of parts) {
    acc += '/' + part;
    const match = findInTree(tree, acc);
    out.push({ label: match?.node.label ?? capitalize(part), url: acc });
  }
  return out;
}
