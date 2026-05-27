import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../icons';

export type BulkAction = 'start' | 'stop' | 'restart' | 'update' | 'remove' | 'clear';

@customElement('md-docker-bulk-bar')
export class MdDockerBulkBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: sticky; bottom: 16px;
      margin: 16px 0 0 0;
      z-index: 8;
    }
    .bar {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
    .count { font-size: 13px; color: var(--text-secondary); margin-right: 8px; }
    .count strong { color: var(--text-primary); }
    .divider { width: 1px; height: 20px; background: var(--border-subtle); margin: 0 4px; }
    .spacer { flex: 1; }

    button {
      display: inline-flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px;
      background: transparent;
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      font: 500 13px var(--font-sans);
      cursor: pointer;
    }
    button:hover { background: var(--bg-base); color: var(--text-primary); }
    button.danger { color: var(--danger); border-color: rgba(239,68,68,.4); }
    button.danger:hover { background: rgba(239,68,68,.12); }
    .icon-btn { width: 32px; padding: 0; }
  `;

  @property({ type: Number }) selectedCount = 0;

  private _emit(action: BulkAction): void {
    this.dispatchEvent(new CustomEvent<{ action: BulkAction }>('docker-bulk', {
      detail: { action }, bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="bar">
        <span class="count"><strong>${this.selectedCount}</strong> selected</span>
        <span class="divider"></span>
        <button @click=${() => this._emit('start')}>${icon('play')} Start</button>
        <button @click=${() => this._emit('stop')}>${icon('stop')} Stop</button>
        <button @click=${() => this._emit('restart')}>${icon('restart')} Restart</button>
        <button @click=${() => this._emit('update')}>${icon('update')} Update</button>
        <span class="spacer"></span>
        <button class="danger" @click=${() => this._emit('remove')}>${icon('trash')} Remove</button>
        <button class="icon-btn" title="Clear selection" @click=${() => this._emit('clear')}>${icon('x')}</button>
      </div>
    `;
  }
}
