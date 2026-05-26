import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../icons';

@customElement('shell-notification-bell')
export class ShellNotificationBell extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px; font-size: 16px;
    }
    .trigger:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .badge {
      position: absolute; top: 2px; right: 2px;
      min-width: 14px; height: 14px;
      background: var(--accent, #ff8c2f); color: #fff;
      border-radius: 7px; font-size: 9px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px; box-sizing: border-box;
      pointer-events: none;
    }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      width: 320px; max-height: 400px; overflow-y: auto;
      padding: 8px; display: none; z-index: 100;
    }
    :host([open]) .popover { display: block; }
    .item {
      padding: 8px; font-size: 12px; color: var(--text-primary);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
    }
    .item:last-child { border-bottom: 0; }
    .empty { padding: 16px; color: var(--text-secondary); font-size: 12px; text-align: center; }
  `;

  @state() private _open = false;
  @state() private _unread = 0;
  @state() private _items: Array<{ title: string; severity?: string }> = [];

  private _observer: MutationObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._sync();
    // Unraid 7.3 replaces #notifier with the <unraid-standalone-criticalnotifications-*>
    // Vue web component; pre-7.3 uses #notifier. Fall back to [data-notifications]
    // or body so we always observe *something*.
    const source = document.getElementById('notifier')
      || document.querySelector('unraid-standalone-criticalnotifications, [class*="CriticalNotifications"], [class*="criticalnotifications"]')
      || document.querySelector('[data-notifications]')
      || document.body;
    this._observer = new MutationObserver(() => this._sync());
    const isBodyFallback = source === document.body;
    this._observer.observe(source, {
      childList: true,
      subtree: !isBodyFallback,
      characterData: !isBodyFallback,
    });
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    document.removeEventListener('click', this._onOutside);
  }

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._open = false;
      this.removeAttribute('open');
    }
  };

  private _toggle = (e: MouseEvent): void => {
    e.stopPropagation();
    this._open = !this._open;
    this.toggleAttribute('open', this._open);
  };

  private _sync(): void {
    // Pre-7.3: #notifier has span.unread/.total + per-item .notification children.
    // Unraid 7.3: <unraid-standalone-criticalnotifications-*> Vue component (its
    // internal badge markup lives in a shadow root we can't reach with
    // document.querySelector). Best-effort: walk both shapes and read what we can.
    const legacy = document.getElementById('notifier');
    const vue = document.querySelector('unraid-standalone-criticalnotifications, [class*="CriticalNotifications"], [class*="criticalnotifications"]');
    const source = legacy || vue;
    if (!source) {
      this._unread = 0;
      this._items = [];
      return;
    }

    const countNode = source.querySelector('.unread, .total, [data-count]');
    let count = parseInt(countNode?.textContent?.trim() || '', 10);
    if (!isFinite(count) && vue) {
      // Vue component: try a `data-count` attribute, then fall back to scanning
      // the lightDOM text for a leading integer (the badge text in 7.3 is the
      // numeric count). Returns 0 if we can't find anything sensible.
      const attr = parseInt(vue.getAttribute('data-count') || vue.getAttribute('count') || '', 10);
      if (isFinite(attr)) {
        count = attr;
      } else {
        const m = (vue.textContent || '').match(/\b(\d{1,3})\b/);
        count = m ? parseInt(m[1], 10) : 0;
      }
    }
    this._unread = isFinite(count) ? count : 0;

    const items = Array.from(source.querySelectorAll('.notification, [data-notification]')).slice(0, 20);
    // severity is parsed for future styling (Phase 5+); currently unused in render().
    this._items = items.map((el) => ({
      title: el.querySelector('.subject, .title')?.textContent?.trim() || el.textContent?.trim().slice(0, 80) || '',
      severity: (el.getAttribute('data-severity') || 'info') as string,
    }));
  }

  render() {
    return html`
      <button class="trigger" type="button" @click=${this._toggle} aria-label="Notifications" title="Notifications">${icon('bell', 18)}</button>
      ${this._unread > 0 ? html`<span class="badge">${this._unread > 99 ? '99+' : this._unread}</span>` : ''}
      <div class="popover" role="menu">
        ${this._items.length === 0
          ? html`<div class="empty">No notifications</div>`
          : this._items.map((it) => html`<div class="item">${it.title}</div>`)}
      </div>
    `;
  }
}
