import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MainStore } from '../store';
import type { MainPageState } from '../types';

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
      height: 56px;
      border-radius: var(--radius-lg, 10px);
      background: linear-gradient(90deg,
        var(--bg-surface, #1e1e1e) 0%,
        var(--bg-surface-2, #2a2a2a) 50%,
        var(--bg-surface, #1e1e1e) 100%);
      background-size: 200% 100%;
      animation: shimmer 1.2s ease-in-out infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .skeleton .bar { animation: none; } }
    .summary { font-size: 14px; line-height: 1.6; }
    .summary strong { color: var(--text-primary, #fff); }
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

  render() {
    if (this._loading || !this._state) {
      return html`<div class="skeleton">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>`;
    }
    // Placeholder summary until Task 6 lands the device-table cards. Proves the
    // fetch → store → render path works end to end.
    const s = this._state;
    return html`<div class="summary">
      <p>Array: <strong>${s.operation.mdState}</strong> / ${s.operation.fsState}
        — ${s.array.devices.length} devices</p>
      <p>Pools: <strong>${s.pools.length}</strong>${s.boot ? ' · Boot: flash' : ''}</p>
      <p>Encryption: <strong>${s.operation.encryption.mode}</strong></p>
    </div>`;
  }
}
