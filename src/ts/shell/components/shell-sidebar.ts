import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
      width: 32px;
      height: 32px;
      background: var(--accent, #ff8c2f);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .name {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .body { flex: 1; min-height: 0; overflow-y: auto; }
    .footer {
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      padding: 8px 0;
    }
  `;

  @state() private _serverName = '';

  connectedCallback(): void {
    super.connectedCallback();
    this._serverName = this._readServerName();
  }

  private _readServerName(): string {
    // Unraid's tilebar carries the server name as visible text. Try a few
    // selectors in case the DOM shape varies between releases. Falls back
    // to document.title's first segment so we always have something.
    const tilebar = document.querySelector('header.tilebar');
    if (tilebar) {
      const logo = tilebar.querySelector('.logo, .server-name, .name');
      const text = (logo?.textContent || tilebar.textContent || '').trim();
      if (text) return text.split(/\s{2,}|\n/)[0].trim();
    }
    return (document.title || '').split('/')[0].trim() || 'Unraid';
  }

  render() {
    return html`
      <a class="header" href="/Dashboard">
        <span class="logo"></span>
        <span class="name">${this._serverName}</span>
      </a>
      <div class="body"></div>
      <div class="footer"></div>
    `;
  }
}
