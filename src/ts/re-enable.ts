import { injectReEnablePill, isClientReady } from './fallback';

function reEnable(): void {
  fetch('/plugins/unraid-modernui/include/save.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=enable',
  })
    .then(() => window.location.reload())
    .catch((err) => {
      console.error('[modernui] failed to re-enable:', err);
      alert('Could not re-enable Modern UI. Check the browser console.');
    });
}

function boot(): void {
  if (isClientReady(document)) {
    injectReEnablePill(document, reEnable);
  } else {
    document.addEventListener('DOMContentLoaded', () => injectReEnablePill(document, reEnable));
  }
}

boot();
