import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ref, createRef, type Ref } from 'lit/directives/ref.js';
import { pathToBreadcrumb, type BreadcrumbSegment } from '../breadcrumb';
import { CURATED_NAV } from '../nav-builder';
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
import './shell-notification-bell';
import './shell-user-menu';

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
    .plugin-mirror {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
    }
    .plugin-mirror a, .plugin-mirror button {
      width: 100%; height: 100%;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .plugin-mirror img, .plugin-mirror svg { width: 18px; height: 18px; }
    .hamburger { display: none; }
    @media (max-width: 959px) {
      .hamburger { display: inline-flex; }
    }
    @media (max-width: 639px) {
      .breadcrumb { font-size: 12px; }
      .breadcrumb a:not(:last-child), .breadcrumb .sep:not(:last-of-type) { display: none; }
    }
  `;

  @state() private _crumbs: BreadcrumbSegment[] = [];
  @state() private _pluginItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
  private _pluginRefs = new Map<Element, Ref<HTMLElement>>();

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    window.addEventListener('popstate', this._refresh);
    const tilebar = document.querySelector('header.tilebar .tilebar-icons, header.tilebar .icons, header.tilebar');
    this._disposeMirror = startMirror({
      source: tilebar,
      registry: REGISTRY.topbar,
      onUpdate: (items) => { this._pluginItems = items; },
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._refresh);
    this._disposeMirror?.();
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

  private _renderPluginItem(it: { entry: PluginEntry | null; node: Element }) {
    let r = this._pluginRefs.get(it.node);
    if (!r) { r = createRef(); this._pluginRefs.set(it.node, r); }
    return html`
      <span
        class="plugin-mirror"
        title=${it.entry?.name || 'plugin'}
        ${ref(r)}
      ></span>
    `;
  }

  protected updated(): void {
    for (const [node, r] of this._pluginRefs) {
      const host = r.value;
      if (!host) continue;
      host.innerHTML = '';
      host.appendChild(node.cloneNode(true));
    }
  }

  private _onHamburger = (): void => {
    this.dispatchEvent(new CustomEvent('shell-toggle-drawer', { bubbles: true, composed: true }));
  };

  render() {
    return html`
      <button class="icon-btn hamburger" type="button" @click=${this._onHamburger} title="Menu">☰</button>
      <nav class="breadcrumb">
        ${this._crumbs.map((c, i) => html`
          ${i > 0 ? html`<span class="sep">/</span>` : ''}
          ${c.url ? html`<a href=${c.url}>${c.label}</a>` : html`<span>${c.label}</span>`}
        `)}
      </nav>
      <div class="right">
        <div id="modernui-topbar-actions" class="slot-host"></div>
        <div id="modernui-topbar-plugins" class="slot-host">
          ${this._pluginItems.map((it) => this._renderPluginItem(it))}
        </div>
        <button class="icon-btn" type="button" title="Search" @click=${this._searchToast}>⌕</button>
        <shell-notification-bell></shell-notification-bell>
        <shell-user-menu></shell-user-menu>
      </div>
    `;
  }
}
