import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MainStore } from '../store';
import type { MainPageState } from '../types';
import './md-main-capacity-hero';
import './md-main-array-card';
import './md-main-pool-card';
import './md-main-boot-card';
import './md-main-operation-panel';
import './md-main-unassigned-card';
import type { UnassignedState } from '../types';
import type { UtilStyle } from './md-main-device-tile';

// Root component for the Modern UI /Main page. Owns nothing but a reference to
// the store; subscribes for re-render. Task 5 ships the skeleton + a minimal
// summary so the mount paints; Task 6 adds the device-table cards and Task 9
// the operation panel.

@customElement('modernui-main-page')
export class ModernuiMainPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 1280px;
      margin: 0 auto;
      padding: 16px 8px 48px;
      color: var(--text-primary, #ddd);
      font-family: var(--font-sans, system-ui, sans-serif);
    }
    .skeleton {
      display: grid;
      gap: 12px;
    }
    .skeleton .bar {
      height: 120px;
      border-radius: var(--radius-lg, 10px);
      background: linear-gradient(90deg,
        var(--bg-surface, #1e1e1e) 0%,
        var(--bg-elevated, #2a2a2a) 50%,
        var(--bg-surface, #1e1e1e) 100%);
      background-size: 200% 100%;
      animation: shimmer 1.2s ease-in-out infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .skeleton .bar { animation: none; } }
    .error {
      padding: 16px; border-radius: var(--radius-lg);
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
      color: var(--text-secondary); font-size: 14px;
    }
    /* Disk-usage style toggle — one-click Bar/Ring, persisted to the setting. */
    .util-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin: 0 2px 14px; }
    .util-toolbar .label { font-size: 12px; color: var(--text-secondary); }
    .seg { display: inline-flex; padding: 3px; gap: 3px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    .seg button { padding: 5px 14px; border: 0; border-radius: var(--radius-sm); font: inherit; font-size: 12.5px; font-weight: 500; color: var(--text-secondary); background: transparent; cursor: pointer; }
    .seg button:hover { color: var(--text-primary); }
    .seg button.active { background: var(--bg-elevated); color: var(--text-primary); box-shadow: 0 1px 2px rgba(0,0,0,.25); }
  `;

  private _store: MainStore | null = null;
  private _unsub: (() => void) | null = null;

  @state() private _state: MainPageState | null = null;
  @state() private _loading = true;
  @state() private _unassigned: UnassignedState | null = null;

  /** Set by boot.ts after fetching ud-state.php (and on resync). */
  setUnassigned(u: UnassignedState): void { this._unassigned = u; }

  setStore(store: MainStore): void {
    this._unsub?.();
    this._store = store;
    this._unsub = store.subscribe(() => this._sync());
    this._sync();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
  }

  private _sync(): void {
    if (!this._store) return;
    this._state = this._store.getState();
    this._loading = this._store.isLoading();
  }

  // Per-install disk-usage style (Bar / Ring), set on <html> by loader.js from
  // the `mainUtilStyle` setting. Defaults to 'bar'.
  private get _util(): UtilStyle {
    return document.documentElement.dataset.modernuiMainUtil === 'ring' ? 'ring' : 'bar';
  }

  // In-page toggle: flip every tile now AND persist so it sticks on reload.
  // Writes the same `main_util_style` setting via the stock save endpoint
  // (partial-merge, like the sidebar toggle) — no full Settings round-trip.
  private _setUtil = async (next: UtilStyle): Promise<void> => {
    if (this._util === next) return;
    document.documentElement.dataset.modernuiMainUtil = next;
    this.requestUpdate();
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return; // best-effort; the live UI already reflects the change
    const body = new URLSearchParams();
    body.set('main_util_style', next);
    body.set('csrf_token', csrf);
    await fetch('/plugins/unraid-modernui/include/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).catch(() => undefined);
  };

  /** Re-fetch the snapshot after an action. Set by boot.ts. */
  resync: () => void = () => {};

  render() {
    if (this._loading || !this._state) {
      return html`<div class="skeleton">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>`;
    }
    const s = this._state;
    const util = this._util;
    return html`
      <md-main-operation-panel .state=${s} .csrf=${s.csrfToken} .resync=${this.resync}></md-main-operation-panel>
      <div class="util-toolbar">
        <span class="label">Disk usage</span>
        <div class="seg" role="group" aria-label="Disk usage style">
          <button type="button" class=${util === 'bar' ? 'active' : ''} @click=${() => this._setUtil('bar')}>Bar</button>
          <button type="button" class=${util === 'ring' ? 'active' : ''} @click=${() => this._setUtil('ring')}>Ring</button>
        </div>
      </div>
      <md-main-capacity-hero .array=${s.array} .isProtected=${s.operation.protected}></md-main-capacity-hero>
      <md-main-array-card .array=${s.array} .util=${util}></md-main-array-card>
      ${s.pools.map(
        (p) => html`<md-main-pool-card .pool=${p} .util=${util}></md-main-pool-card>`,
      )}
      ${s.boot ? html`<md-main-boot-card .device=${s.boot} .util=${util}></md-main-boot-card>` : ''}
      ${this._unassigned && this._unassigned.available
        ? html`<md-main-unassigned-card .state=${this._unassigned} .csrf=${s.csrfToken} .resync=${this.resync}></md-main-unassigned-card>`
        : ''}
    `;
  }
}
