import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { buildNav, type NavItem, type StockAnchor } from '../nav-builder';
import './shell-nav-item';
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
import { icon } from '../icons';
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
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 2px;
      padding: 10px 16px;
      height: 64px;
      box-sizing: border-box;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .header:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .logo-wordmark {
      height: 28px;
      width: auto;
      max-width: 100%;
      object-fit: contain;
      display: block;
    }
    /* Use the real apple-touch-icon PNG (which is the actual Unraid logomark)
       but zoom in 145% to crop the hard-white square padding baked into it,
       and clip the result to a circle for any remaining edge pixels. */
    .logo-mark {
      width: 32px; height: 32px;
      display: none;
      flex-shrink: 0;
      background-image: url('/apple-touch-icon.png');
      background-size: 145% 145%;
      background-position: center;
      background-repeat: no-repeat;
      border-radius: 50%;
    }
    .name {
      font-size: 11px; font-weight: 500;
      color: var(--text-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 100%;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    :host-context(body.modernui-shell-collapsed) .header {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding: 12px 16px;
    }
    :host-context(body.modernui-shell-collapsed) .logo-wordmark { display: none; }
    :host-context(body.modernui-shell-collapsed) .logo-mark { display: block; }
    .body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0; }
    .footer {
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      padding: 8px 0;
    }

    /* Sidebar default toggle. Expanded sidebar shows a labeled segmented pill
       so the user knows what the setting controls. Collapsed sidebar shrinks
       to a single chevron icon to fit the narrow rail. */
    .default-toggle {
      margin: 8px 12px 4px;
      display: flex; align-items: center; gap: 8px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .default-toggle .label {
      font: 600 10px var(--font-sans, system-ui);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .segmented {
      flex: 1;
      display: inline-flex;
      background: var(--bg-elev-1, rgba(255,255,255,0.04));
      border-radius: 9999px;
      padding: 2px;
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
    }
    .segmented button {
      flex: 1;
      display: inline-flex; align-items: center; justify-content: center; gap: 4px;
      height: 22px; padding: 0 8px;
      background: transparent;
      border: 0; cursor: pointer;
      border-radius: 9999px;
      color: var(--text-secondary);
      font: 500 11px var(--font-sans, system-ui);
    }
    .segmented button:hover { color: var(--text-primary); }
    .segmented button[data-active] {
      background: var(--mui-accent, #ff8c2f);
      color: #fff;
    }

    .collapse-toggle {
      width: 100%;
      background: transparent;
      color: var(--text-secondary);
      border: 0;
      padding: 8px;
      cursor: pointer;
      font: inherit;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .collapse-toggle:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    /* Rotate one chevron rather than swapping icons — swap forces a re-render
       mid-transition and causes a brief flash. Rotation glides with the width. */
    .collapse-toggle .chev {
      display: inline-flex; align-items: center; justify-content: center;
      transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
    }
    :host-context(body.modernui-shell-collapsed) .collapse-toggle .chev {
      transform: rotate(180deg);
    }

    :host-context(body.modernui-shell-collapsed) .default-toggle { display: none; }
    :host-context(body.modernui-shell-collapsed) .name { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .collapse-toggle .chev { transition: none; }
    }
  `;

  @state() private _serverName = '';
  @state() private _nav: NavItem[] = [];
  @state() private _currentPath = '/';
  @state() private _collapsed = false;
  // Saved default — what the sidebar will be set to on next page load.
  // Tracked separately from _collapsed so the pill can preview the saved
  // preference without flipping the live state.
  @state() private _savedDefault: 'expanded' | 'collapsed' = 'expanded';
  @state() private _statusItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
  private _arrayInterval: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._serverName = this._readServerName();
    this._nav = buildNav(this._readStockAnchors());
    this._currentPath = window.location.pathname;
    this._collapsed = document.documentElement.dataset.modernuiSidebar === 'collapsed';
    this._savedDefault = this._collapsed ? 'collapsed' : 'expanded';
    if (this._collapsed) document.body.classList.add('modernui-shell-collapsed');
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: this._collapsed },
      bubbles: true,
      composed: true,
    })));
    window.addEventListener('popstate', this._onNav);
    // Unraid 7.3 emits <footer>.footer-left / .footer-right; pre-7.3 uses div.statusbar.
    // Pick the half's parent so the observer catches both halves' mutations.
    const bottomBar = document.querySelector('footer .footer-left, footer .footer-right')?.parentElement
      || document.querySelector('footer')
      || document.querySelector('div.statusbar');
    this._disposeMirror = startMirror({
      source: bottomBar,
      registry: REGISTRY.bottom,
      onUpdate: (items) => {
        this._statusItems = items;
      },
    });
    // Unraid 7.3 renders <footer> asynchronously after our mount, so the first
    // render misses the status data. Fire a quick re-render at 250ms (after
    // Vue's typical first paint) so the rows appear immediately, then settle
    // into the 5s polling cadence. Skip ticks while the tab is hidden and fire
    // a catch-up render on focus — borrowed from unraid/webgui#2641.
    window.setTimeout(() => this.requestUpdate(), 250);
    this._arrayInterval = window.setInterval(() => {
      if (!document.hidden) this.requestUpdate();
    }, 5000);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onNav);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._disposeMirror?.();
    if (this._arrayInterval) clearInterval(this._arrayInterval);
  }

  private _onVisibility = (): void => {
    if (!document.hidden) this.requestUpdate();
  };

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
    // Unraid 7.3 renders <div id="menu"> with .nav-item > a[href]; pre-7.3 uses <nav class="tabs">.
    const nav = document.querySelector('#menu, nav.tabs');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('a[href]')).map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute('href') || '',
      text: a.textContent?.trim() || '',
    }));
  }

  // Chevron toggle: flips the live sidebar AND saves so the new state
  // persists. This is the "I want this changed right now" affordance.
  private _toggleCollapsed = async (): Promise<void> => {
    const next = !this._collapsed;
    this._collapsed = next;
    document.body.classList.toggle('modernui-shell-collapsed', next);
    document.documentElement.dataset.modernuiSidebar = next ? 'collapsed' : 'expanded';
    this._savedDefault = next ? 'collapsed' : 'expanded';
    await this._persistCollapsed(next);
    this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: next },
      bubbles: true,
      composed: true,
    }));
  };

  // Pill click: saves the preference for future page loads WITHOUT collapsing
  // or expanding the sidebar in the current session. Lets the user say
  // "next time I load, I want it like X" without disrupting their current view.
  private _setDefault = async (target: 'expanded' | 'collapsed'): Promise<void> => {
    if (this._savedDefault === target) return;
    this._savedDefault = target;
    await this._persistCollapsed(target === 'collapsed');
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
    // Unraid 7.3 dropped .array-state — the indicator now lives in <footer> .footer-left.
    const el = document.querySelector('.array-state, [data-array-state], footer .footer-left');
    if (!el) return '';
    const text = el.textContent?.trim() || '';
    if (!text) return '';
    const dotColor = /started/i.test(text) ? '#22c55e' : /stopped/i.test(text) ? '#ef4444' : '#f59e0b';
    return html`
      <shell-status-row icon-name="harddisk" label="Array" value=${text} dot-color=${dotColor}></shell-status-row>
    `;
  }

  private _renderStatus(it: { entry: PluginEntry | null; node: Element }) {
    // Skip layout filler + the array-state row (rendered separately by _renderArrayState).
    const cls = it.node.className || '';
    if (/footer-spacer/.test(cls)) return '';
    // .footer-left and .footer-right are rendered directly by _renderArrayState /
    // _renderFooterRight; the mirror only surfaces non-Dynamix plugin children.
    if (/footer-left/.test(cls)) return '';
    if (/footer-right/.test(cls)) return '';
    const text = it.node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
    if (!text) return '';
    if (it.entry) {
      return html`
        <shell-status-row
          label=${it.entry.label || it.entry.name}
          value=${text}
        ></shell-status-row>
      `;
    }
    return html`
      <shell-status-row label="Plugin" value=${text}></shell-status-row>
    `;
  }

  // Direct-query fallback for Unraid 7.3 footer-right (temps + power + UPS).
  // Used instead of the MutationObserver mirror because <footer> is rendered
  // by Vue after our connectedCallback runs, leaving the mirror source null.
  // Updates ride the 5-second setInterval that already drives _renderArrayState.
  private _renderFooterRight() {
    const right = document.querySelector('footer .footer-right');
    if (!right) return '';
    const text = right.textContent?.trim().replace(/\s+/g, ' ') || '';
    if (!text) return '';
    const temps = text.match(/(\d+°C\s*)+/)?.[0]?.trim();
    const power = text.match(/\d+\s*W(?:\s*\(\d+\s*VA\))?/)?.[0];
    const upsMatch = text.match(/(\d+)\s*%/);
    const ups = upsMatch?.[0];

    // Status-aware coloring so collapsed-mode icons aren't all grey.
    const tempVals = temps ? temps.match(/\d+/g)?.map((s) => parseInt(s, 10)) ?? [] : [];
    const maxTemp = tempVals.length ? Math.max(...tempVals) : 0;
    const tempColor = maxTemp >= 75 ? '#ef4444' : maxTemp >= 60 ? '#f59e0b' : maxTemp > 0 ? '#22c55e' : '';

    const upsPct = upsMatch ? parseInt(upsMatch[1], 10) : -1;
    const upsColor = upsPct >= 80 ? '#22c55e' : upsPct >= 20 ? '#f59e0b' : upsPct >= 0 ? '#ef4444' : '';

    return html`
      ${temps ? html`<shell-status-row icon-name="thermometer" label="Temps" value=${temps} dot-color=${tempColor}></shell-status-row>` : ''}
      ${power ? html`<shell-status-row icon-name="flash" label="Power" value=${power} dot-color="#60a5fa"></shell-status-row>` : ''}
      ${ups ? html`<shell-status-row icon-name="battery" label="UPS" value=${ups} dot-color=${upsColor}></shell-status-row>` : ''}
    `;
  }

  render() {
    return html`
      <a class="header" href="/Dashboard">
        <img class="logo-wordmark" src="/webGui/images/UN-logotype-gradient.svg" alt="Unraid">
        <span class="logo-mark" role="img" aria-label="Unraid"></span>
        <span class="name">${this._serverName}</span>
      </a>
      <div class="body">
        ${this._nav.map((item) => html`
          <shell-nav-item .item=${item} current-path=${this._currentPath}></shell-nav-item>
        `)}
      </div>
      <div class="footer">
        ${this._renderArrayState()}
        ${this._renderFooterRight()}
        ${this._statusItems.map((it) => this._renderStatus(it))}
        ${this._collapsed ? '' : html`
          <div class="default-toggle" title="Sidebar state used on next page load. Use the chevron below to collapse now.">
            <span class="label">Default</span>
            <div class="segmented" role="group" aria-label="Sidebar default state on next page load">
              <button ?data-active=${this._savedDefault === 'expanded'} @click=${() => this._setDefault('expanded')}>Expanded</button>
              <button ?data-active=${this._savedDefault === 'collapsed'} @click=${() => this._setDefault('collapsed')}>Collapsed</button>
            </div>
          </div>
        `}
        <button class="collapse-toggle" type="button" @click=${this._toggleCollapsed} aria-label=${this._collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <span class="chev">${icon('chevron-left', 18)}</span>
        </button>
      </div>
    `;
  }
}
