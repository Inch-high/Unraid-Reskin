import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MainStore } from '../store';
import type { MainPageState } from '../types';
import './md-main-array-card';
import './md-main-pool-card';
import './md-main-boot-card';
import './md-main-operation-panel';

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
  `;

  private _store: MainStore | null = null;
  private _unsub: (() => void) | null = null;

  @state() private _state: MainPageState | null = null;
  @state() private _loading = true;

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

  private get _compact(): boolean {
    return document.documentElement.dataset.modernuiDensity === 'compact';
  }

  /** Re-fetch the snapshot after an action. Set by boot.ts. */
  resync: () => void = () => {};

  render() {
    if (this._loading || !this._state) {
      return html`<div class="skeleton">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>`;
    }
    const s = this._state;
    const compact = this._compact;
    return html`
      <md-main-operation-panel .state=${s} .csrf=${s.csrfToken} .resync=${this.resync}></md-main-operation-panel>
      <md-main-array-card .array=${s.array} ?compact=${compact}></md-main-array-card>
      ${s.pools.map(
        (p) => html`<md-main-pool-card .pool=${p} ?compact=${compact}></md-main-pool-card>`,
      )}
      ${s.boot ? html`<md-main-boot-card .device=${s.boot} ?compact=${compact}></md-main-boot-card>` : ''}
    `;
  }
}
