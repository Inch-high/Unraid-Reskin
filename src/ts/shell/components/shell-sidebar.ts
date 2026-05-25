import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { buildNav, type NavItem, type StockAnchor } from '../nav-builder';
import './shell-nav-item';
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
import './shell-status-row';

@customElement('shell-sidebar')
export class ShellSidebar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      height: 64px;
      box-sizing: border-box;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .header:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .logo {
      width: 32px; height: 32px;
      background: var(--accent, #ff8c2f);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .name {
      font-size: 14px; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    .body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0; }
    .footer {
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      padding: 8px 0;
    }
    .collapse-toggle {
      width: 100%;
      background: transparent;
      color: var(--text-secondary);
      border: 0;
      padding: 8px;
      cursor: pointer;
      font: inherit;
    }
    .collapse-toggle:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    :host-context(body.modernui-shell-collapsed) .name { display: none; }
  `;

  @state() private _serverName = '';
  @state() private _nav: NavItem[] = [];
  @state() private _currentPath = '/';
  @state() private _collapsed = false;
  @state() private _statusItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
  private _arrayInterval: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._serverName = this._readServerName();
    this._nav = buildNav(this._readStockAnchors());
    this._currentPath = window.location.pathname;
    this._collapsed = document.documentElement.dataset.modernuiSidebar === 'collapsed';
    if (this._collapsed) document.body.classList.add('modernui-shell-collapsed');
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: this._collapsed },
      bubbles: true,
      composed: true,
    })));
    window.addEventListener('popstate', this._onNav);
    const bottomBar = document.querySelector('div.statusbar') || document.querySelector('footer');
    this._disposeMirror = startMirror({
      source: bottomBar,
      registry: REGISTRY.bottom,
      onUpdate: (items) => {
        this._statusItems = items;
      },
    });
    this._arrayInterval = window.setInterval(() => this.requestUpdate(), 5000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onNav);
    this._disposeMirror?.();
    if (this._arrayInterval) clearInterval(this._arrayInterval);
  }

  private _onNav = (): void => {
    this._currentPath = window.location.pathname;
  };

  private _readServerName(): string {
    const tilebar = document.querySelector('header.tilebar');
    if (tilebar) {
      const logo = tilebar.querySelector('.logo, .server-name, .name');
      const text = (logo?.textContent || tilebar.textContent || '').trim();
      if (text) return text.split(/\s{2,}|\n/)[0].trim();
    }
    return (document.title || '').split('/')[0].trim() || 'Unraid';
  }

  private _readStockAnchors(): StockAnchor[] {
    // Walk Unraid's hidden top-nav anchors so we pick up plugin-added entries.
    const nav = document.querySelector('nav.tabs');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('a[href]')).map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute('href') || '',
      text: a.textContent?.trim() || '',
    }));
  }

  private _toggleCollapsed = async (): Promise<void> => {
    this._collapsed = !this._collapsed;
    document.body.classList.toggle('modernui-shell-collapsed', this._collapsed);
    document.documentElement.dataset.modernuiSidebar = this._collapsed ? 'collapsed' : 'expanded';
    await this._persistCollapsed(this._collapsed);
    this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: this._collapsed },
      bubbles: true,
      composed: true,
    }));
  };

  private async _persistCollapsed(collapsed: boolean): Promise<void> {
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return; // best-effort; UI state still toggles
    const body = new URLSearchParams();
    body.set('sidebar', collapsed ? 'collapsed' : 'expanded');
    body.set('csrf_token', csrf);
    await fetch('/plugins/unraid-modernui/include/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).catch(() => undefined);
  }

  private _renderArrayState() {
    const el = document.querySelector('.array-state, [data-array-state]');
    if (!el) return '';
    const text = el.textContent?.trim() || '';
    const dotColor = /started/i.test(text) ? '#22c55e' : /stopped/i.test(text) ? '#ef4444' : '#f59e0b';
    return html`
      <shell-status-row label="Array" value=${text} dot-color=${dotColor}></shell-status-row>
    `;
  }

  private _renderStatus(it: { entry: PluginEntry | null; node: Element }) {
    const text = it.node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 32) || '';
    if (it.entry) {
      return html`
        <shell-status-row
          label=${it.entry.label || it.entry.name}
          value=${text}
        ></shell-status-row>
      `;
    }
    // Unknown plugin — render generic row preserving the original DOM via innerHTML clone
    return html`
      <shell-status-row label="Plugin" value=${text}></shell-status-row>
    `;
  }

  render() {
    return html`
      <a class="header" href="/Dashboard">
        <span class="logo"></span>
        <span class="name">${this._serverName}</span>
      </a>
      <div class="body">
        ${this._nav.map((item) => html`
          <shell-nav-item .item=${item} current-path=${this._currentPath}></shell-nav-item>
        `)}
      </div>
      <div class="footer">
        ${this._renderArrayState()}
        ${this._statusItems.map((it) => this._renderStatus(it))}
        <button class="collapse-toggle" type="button" @click=${this._toggleCollapsed}>
          ${this._collapsed ? '▶' : '◀'}
        </button>
      </div>
    `;
  }
}
