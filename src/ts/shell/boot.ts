import './components/modernui-shell';

export function shellEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiShell !== 'off';
}

export function shellBoot(doc: Document): void {
  if (!shellEnabled(doc)) return;
  if (doc.querySelector('modernui-shell')) return;
  doc.body.classList.add('modernui-shell-active');
  const shell = doc.createElement('modernui-shell');
  doc.body.appendChild(shell);
}
