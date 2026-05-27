import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../icons';

interface NotifyEntry {
  file: string;
  show: number;
  timestamp: string;
  event: string;
  subject: string;
  description: string;
  importance: string;
  link: string;
}

const POLL_MS = 10000;

@customElement('shell-notification-bell')
export class ShellNotificationBell extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px; font-size: 16px;
      transition: color 150ms ease;
    }
    .trigger:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    /* Bell turns Unraid orange when there's anything unread — pairs with the
       badge so the glance-test "do I have notifications?" works even when
       the user's eye sits on the icon, not the corner. */
    :host([has-unread]) .trigger { color: var(--mui-accent, #ff8c2f); }
    .badge {
      position: absolute; top: 2px; right: 2px;
      min-width: 16px; height: 16px;
      background: var(--mui-accent, #ff8c2f); color: #fff;
      border-radius: 8px; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      padding: 0 4px; box-sizing: border-box;
      pointer-events: none;
      /* Dark ring so the badge reads against any topbar background and
         visually separates from the bell behind it. */
      box-shadow: 0 0 0 2px var(--bg-surface, #1a1a1a);
    }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      width: 360px; max-height: 480px; overflow-y: auto;
      padding: 0;
      display: none; z-index: 100;
    }
    :host([open]) .popover { display: block; }
    .item {
      display: flex; flex-direction: column; gap: 2px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
      color: var(--text-primary);
      text-decoration: none;
      font-size: 12px;
      position: relative;
    }
    .item:last-of-type { border-bottom: 0; }
    .item:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .item .subject { font-weight: 500; padding-right: 22px; }
    .item .desc    { color: var(--text-secondary); font-size: 11px; }
    .item .meta    { color: var(--text-secondary); font-size: 10px; opacity: 0.7; }
    .item.alert   .subject { color: #ef4444; }
    .item.warning .subject { color: #f59e0b; }
    .dismiss {
      position: absolute; top: 8px; right: 8px;
      width: 18px; height: 18px;
      background: transparent; border: 0; color: var(--text-secondary);
      cursor: pointer; border-radius: 4px; font-size: 11px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .dismiss:hover { background: var(--bg-elev-2, rgba(255,255,255,0.08)); color: var(--text-primary); }
    .empty { padding: 24px 16px; color: var(--text-secondary); font-size: 12px; text-align: center; }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;
    }
    .archive-all {
      background: transparent; border: 0; color: var(--mui-accent, #ff8c2f);
      cursor: pointer; font: inherit; padding: 0;
    }
    .archive-all:hover { text-decoration: underline; }
  `;

  @state() private _open = false;
  @state() private _items: NotifyEntry[] = [];
  private _pollInterval: number | null = null;

  protected updated(): void {
    // Mirror unread state onto the host so the CSS :host([has-unread]) hook
    // can colour the bell. Reflecting a derived flag is cheaper than a
    // dedicated @property + reactive setter.
    this.toggleAttribute('has-unread', this._items.length > 0);
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this._sync();
    this._pollInterval = window.setInterval(() => {
      if (!document.hidden) void this._sync();
    }, POLL_MS);
    document.addEventListener('visibilitychange', this._onVisibility);
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._pollInterval) clearInterval(this._pollInterval);
    document.removeEventListener('visibilitychange', this._onVisibility);
    document.removeEventListener('click', this._onOutside);
  }

  private _onVisibility = (): void => {
    if (!document.hidden) void this._sync();
  };

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
    if (this._open) void this._sync();
  };

  /**
   * Unraid 7.3 dropped the legacy #notifier element entirely — the Vue
   * components only render markup when a notification is being shown as a
   * toast. The persistent unread list lives at /tmp/notifications/unread/
   * and is reachable via Notify.php POST cmd=get (returns JSON array).
   */
  private async _sync(): Promise<void> {
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return; // can't POST without it
    try {
      const body = new URLSearchParams();
      body.set('cmd', 'get');
      body.set('csrf_token', csrf);
      const r = await fetch('/webGui/include/Notify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!r.ok) return;
      const text = (await r.text()).trim();
      if (!text || text === '[]') {
        this._items = [];
        return;
      }
      const arr = JSON.parse(text) as NotifyEntry[];
      // Sort newest first by parsing the dd-mm-yyyy HH:MM timestamp.
      arr.sort((a, b) => this._tsKey(b.timestamp) - this._tsKey(a.timestamp));
      this._items = arr;
    } catch {
      // Network / parse failure — leave existing state alone so a transient
      // blip doesn't briefly hide a known-unread badge.
    }
  }

  private _tsKey(ts: string): number {
    // Unraid emits "dd-mm-yyyy HH:MM" — convert to YYYYMMDDHHMM for sortable ordering.
    const m = ts.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
    if (!m) return 0;
    return parseInt(`${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}`, 10);
  }

  private async _archive(entry: NotifyEntry, e: Event): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return;
    // Optimistic: drop from list immediately so the UI feels snappy.
    this._items = this._items.filter((it) => it.file !== entry.file);
    const body = new URLSearchParams();
    body.set('cmd', 'archive');
    body.set('file', entry.file);
    body.set('csrf_token', csrf);
    try {
      await fetch('/webGui/include/Notify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      // If the archive failed the next poll will re-add the entry.
    }
  }

  private async _archiveAll(e: Event): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    const snapshot = [...this._items];
    this._items = [];
    for (const item of snapshot) {
      await this._archive(item, new Event('archive-all'));
    }
  }

  private _renderItem = (entry: NotifyEntry) => {
    const importance = (entry.importance || 'normal').toLowerCase();
    const inner = html`
      <div class="subject">${entry.subject || entry.event}</div>
      ${entry.description ? html`<div class="desc">${entry.description}</div>` : ''}
      <div class="meta">${entry.event} · ${entry.timestamp}</div>
      <button class="dismiss" type="button" title="Archive" @click=${(e: Event) => this._archive(entry, e)}>${icon('close', 11)}</button>
    `;
    return entry.link
      ? html`<a class="item ${importance}" href=${entry.link}>${inner}</a>`
      : html`<div class="item ${importance}">${inner}</div>`;
  };

  render() {
    const count = this._items.length;
    return html`
      <button class="trigger" type="button" @click=${this._toggle} aria-label="Notifications" title="Notifications">${icon('bell', 18)}</button>
      ${count > 0 ? html`<span class="badge">${count > 99 ? '99+' : count}</span>` : ''}
      <div class="popover" role="menu">
        ${count === 0
          ? html`<div class="empty">No notifications</div>`
          : html`
              <div class="header">
                <span>${count} unread</span>
                <button class="archive-all" type="button" @click=${(e: Event) => this._archiveAll(e)}>Archive all</button>
              </div>
              ${this._items.map((it) => this._renderItem(it))}
            `}
      </div>
    `;
  }
}
