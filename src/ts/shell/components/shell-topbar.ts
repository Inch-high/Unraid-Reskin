import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ref, createRef, type Ref } from 'lit/directives/ref.js';
import { pathToBreadcrumb, type BreadcrumbSegment } from '../breadcrumb';
import { CURATED_NAV } from '../nav-builder';
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
import { icon } from '../icons';
import './shell-notification-bell';
import './shell-user-menu';
import './shell-search';

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
      .breadcrumb a:not(:last-child) { display: none; }
      .breadcrumb .sep { display: none; }
    }
  `;

  @state() private _crumbs: BreadcrumbSegment[] = [];
  @state() private _pluginItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
  private _pluginRefs = new Map<Element, Ref<HTMLElement>>();

  private _directScanInterval: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    window.addEventListener('popstate', this._refresh);
    // Unraid 7.3 emits #header with Vue web components; pre-7.3 uses <header class="tilebar">.
    // Plugin buttons may sit in the Vue header's right region OR be injected
    // outside the header chrome entirely (the chrome-hide CSS hides the originals
    // either way, so we mirror by cloning).
    const tilebar = document.querySelector(
      '#header [class*="tile-header-right"], unraid-header-action-icons, header.tilebar .tilebar-icons, header.tilebar .icons, header.tilebar'
    );
    this._disposeMirror = startMirror({
      source: tilebar,
      registry: REGISTRY.topbar,
      onUpdate: (items) => { this._pluginItems = this._mergeWithDirectScan(items); },
    });
    // Doc-wide rescan for plugins whose icons mount outside any known header
    // chrome (e.g. Vue slots in shadow roots we can't observe directly). Pause
    // while the tab is hidden and re-scan on focus — borrowed from unraid/webgui#2641.
    this._rescanDirect();
    this._directScanInterval = window.setInterval(() => {
      if (!document.hidden) this._rescanDirect();
    }, 5000);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._refresh);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._disposeMirror?.();
    if (this._directScanInterval) clearInterval(this._directScanInterval);
  }

  private _onVisibility = (): void => {
    if (!document.hidden) this._rescanDirect();
  };

  private _rescanDirect(): void {
    this._pluginItems = this._mergeWithDirectScan(this._pluginItems);
  }

  private _mergeWithDirectScan(
    items: Array<{ entry: PluginEntry | null; node: Element }>,
  ): Array<{ entry: PluginEntry | null; node: Element }> {
    const seen = new Set(items.map((it) => it.node));
    const merged = [...items];
    for (const entry of REGISTRY.topbar) {
      try {
        const matches = document.querySelectorAll(entry.selector);
        for (const node of matches) {
          if (seen.has(node)) continue;
          seen.add(node);
          merged.push({ entry, node });
        }
      } catch {
        // Invalid / unsupported selector — skip.
      }
    }
    return merged;
  }

  private _refresh = (): void => {
    this._crumbs = pathToBreadcrumb(window.location.pathname, CURATED_NAV);
  };

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
      <button class="icon-btn hamburger" type="button" @click=${this._onHamburger} aria-label="Menu" title="Menu">${icon('menu', 20)}</button>
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
        <shell-search></shell-search>
        <shell-notification-bell></shell-notification-bell>
        <shell-user-menu></shell-user-menu>
      </div>
    `;
  }
}
