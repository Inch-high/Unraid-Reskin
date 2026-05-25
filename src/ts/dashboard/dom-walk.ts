// Unraid /Dashboard renders three sibling tables — db_box1, db_box2, db_box3
// (see /usr/local/emhttp/plugins/dynamix/DashStats.page). Each is a draggable
// column tile containing a subset of widget tbodies. We must iterate every
// table.dashboard, not just the first.

export function collectDashboardTables(): HTMLTableElement[] {
  return Array.from(document.querySelectorAll<HTMLTableElement>('table.dashboard'));
}

export function collectDashboardTbodies(): HTMLTableSectionElement[] {
  const out: HTMLTableSectionElement[] = [];
  for (const t of collectDashboardTables()) {
    out.push(...Array.from(t.querySelectorAll<HTMLTableSectionElement>(':scope > tbody')));
  }
  return out;
}
