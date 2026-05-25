import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
  @state() private _items: Array<{ title: string; subject?: string; severity?: string }> = [];

  private _observer: MutationObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._sync();
    const source = document.getElementById('notifier') || document.querySelector('[data-notifications]') || document.body;
    this._observer = new MutationObserver(() => this._sync());
    this._observer.observe(source, { childList: true, subtree: true, characterData: true });
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
    // Unraid's #notifier has a span.unread (or .total) with a count + children
    // describing each notification. Be liberal in what we accept.
    const notifier = document.getElementById('notifier');
    if (!notifier) {
      this._unread = 0;
      this._items = [];
      return;
    }
    const countNode = notifier.querySelector('.unread, .total, [data-count]');
    const count = parseInt(countNode?.textContent?.trim() || '0', 10);
    this._unread = isFinite(count) ? count : 0;

    const items = Array.from(notifier.querySelectorAll('.notification, [data-notification]')).slice(0, 20);
    this._items = items.map((el) => ({
      title: el.querySelector('.subject, .title')?.textContent?.trim() || el.textContent?.trim().slice(0, 80) || '',
      severity: (el.getAttribute('data-severity') || 'info') as string,
    }));
  }

  render() {
    return html`
      <button class="trigger" type="button" @click=${this._toggle} title="Notifications">🔔</button>
      ${this._unread > 0 ? html`<span class="badge">${this._unread > 99 ? '99+' : this._unread}</span>` : ''}
      <div class="popover" role="menu">
        ${this._items.length === 0
          ? html`<div class="empty">No notifications</div>`
          : this._items.map((it) => html`<div class="item">${it.title}</div>`)}
      </div>
    `;
  }
}
