export function isUrlOverrideOff(href: string): boolean {
  const url = new URL(href);
  const value = url.searchParams.get('modernui');
  return value !== null && value.toLowerCase() === 'off';
}

export function isClientReady(doc: Document): boolean {
  return doc.body !== null;
}

export function injectReEnablePill(doc: Document, onClick: () => void): void {
  if (doc.getElementById('modernui-reenable-pill')) return;

  const pill = doc.createElement('button');
  pill.id = 'modernui-reenable-pill';
  pill.type = 'button';
  pill.textContent = 'Enable Modern UI';
  pill.style.cssText = [
    'position: fixed',
    'bottom: 16px',
    'right: 16px',
    'z-index: 99999',
    'padding: 8px 14px',
    'background: #ff8c2f',
    'color: #fff',
    'border: none',
    'border-radius: 9999px',
    'font: 500 13px -apple-system, "Segoe UI", system-ui, sans-serif',
    'cursor: pointer',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.25)',
  ].join(';');
  pill.addEventListener('click', onClick);
  doc.body.appendChild(pill);
}
