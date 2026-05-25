import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { pathToBreadcrumb, type BreadcrumbSegment } from '../breadcrumb';
import { CURATED_NAV } from '../nav-builder';

@customElement('shell-topbar')
export class ShellTopbar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      padding: 0 16px;
      box-sizing: border-box;
      gap: 12px;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .breadcrumb a, .breadcrumb span {
      color: inherit;
      text-decoration: none;
      white-space: nowrap;
    }
    .breadcrumb a:hover { text-decoration: underline; }
    .sep { opacity: 0.5; }
    .right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .slot-host {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px;
      font-size: 14px;
    }
    .icon-btn:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
  `;

  @state() private _crumbs: BreadcrumbSegment[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    window.addEventListener('popstate', this._refresh);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._refresh);
  }

  private _refresh = (): void => {
    this._crumbs = pathToBreadcrumb(window.location.pathname, CURATED_NAV);
  };

  private _searchToast(): void {
    // Placeholder per spec — search is reserved for v0.5+.
    const note = document.createElement('div');
    note.textContent = 'Search coming soon';
    Object.assign(note.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-surface, #222)', color: 'var(--text-primary, #fff)',
      padding: '8px 16px', borderRadius: '6px', zIndex: '2000', fontSize: '13px',
    });
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 1800);
  }

  render() {
    return html`
      <nav class="breadcrumb">
        ${this._crumbs.map((c, i) => html`
          ${i > 0 ? html`<span class="sep">/</span>` : ''}
          ${c.url ? html`<a href=${c.url}>${c.label}</a>` : html`<span>${c.label}</span>`}
        `)}
      </nav>
      <div class="right">
        <div id="modernui-topbar-actions" class="slot-host"></div>
        <div id="modernui-topbar-plugins" class="slot-host"></div>
        <button class="icon-btn" type="button" title="Search" @click=${this._searchToast}>⌕</button>
        <slot name="bell"></slot>
        <slot name="user"></slot>
      </div>
    `;
  }
}
