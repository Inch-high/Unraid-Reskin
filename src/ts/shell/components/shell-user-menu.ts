import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

const VERSION = '0.4.0';
const GITHUB_URL = 'https://github.com/EXAMPLE/unraid-modernui';
const MANUAL_URL = '/webGui/include/Help.php';

@customElement('shell-user-menu')
export class ShellUserMenu extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--mui-accent, #ff8c2f); color: #fff;
      border: 0; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600;
    }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      min-width: 240px;
      padding: 8px;
      display: none;
      z-index: 100;
    }
    :host([open]) .popover { display: block; }
    .item {
      display: block; padding: 8px 12px; width: 100%; text-align: left;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 4px;
      font: inherit;
    }
    .item:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .about { padding: 12px; font-size: 12px; color: var(--text-secondary); }
    .about p { margin: 4px 0; }
    .about a { color: var(--mui-accent, #ff8c2f); text-decoration: none; }
    .divider { height: 1px; background: var(--border-subtle, rgba(255,255,255,0.08)); margin: 4px 0; }
  `;

  @state() private _open = false;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
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

  private _useStock = async (): Promise<void> => {
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return;
    const body = new URLSearchParams();
    body.set('shell', 'off');
    body.set('csrf_token', csrf);
    await fetch('/plugins/unraid-modernui/include/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).catch(() => undefined);
    window.location.reload();
  };

  render() {
    return html`
      <button class="trigger" type="button" @click=${this._toggle} title="User menu">U</button>
      <div class="popover" role="menu">
        <div class="about">
          <p><strong>Modern UI v${VERSION}</strong> · <a href=${GITHUB_URL} target="_blank">GitHub</a></p>
          <p>Unraid® webGui © Lime Technology, Inc. · <a href=${MANUAL_URL} target="_blank">Manual</a></p>
        </div>
        <div class="divider"></div>
        <button class="item" type="button" @click=${this._useStock}>Stock UI</button>
        <a class="item" href="/logout">Logout</a>
      </div>
    `;
  }
}
