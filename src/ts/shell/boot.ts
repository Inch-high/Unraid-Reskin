export function shellEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiShell !== 'off';
}

export function shellBoot(doc: Document): void {
  if (!shellEnabled(doc)) return;
  // Subsequent tasks add: body class, <modernui-shell> mount, observers.
}
