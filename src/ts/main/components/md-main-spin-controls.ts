import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as A from '../actions';

// Spin Up all / Spin Down all / Clear Stats. Disabled while a parity/mover/btrfs
// operation is running (busy != 0), matching stock's gating.
@customElement('md-main-spin-controls')
export class MdMainSpinControls extends LitElement {
  static styles = css`
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    button {
      background: var(--bg-elevated); color: var(--text-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-sm);
      padding: 6px 14px; font: inherit; cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--mui-accent); color: var(--mui-accent); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .note { font-size: 12px; color: var(--text-muted); }
  `;

  @property({ type: Number }) busy: 0 | 1 | 2 | 3 = 0;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  private async _run(req: A.ActionRequest): Promise<void> {
    await A.submit(req, this.csrf);
    this.resync();
  }

  render() {
    const disabled = this.busy !== 0;
    return html`
      <div class="row">
        <button ?disabled=${disabled} @click=${() => this._run(A.buildSpinAll('up'))}>Spin Up</button>
        <button ?disabled=${disabled} @click=${() => this._run(A.buildSpinAll('down'))}>Spin Down</button>
        <button @click=${() => {
          if (confirm('Clear all read/write/error statistics?'))
            void this._run(A.buildClearStats());
        }}>Clear Stats</button>
        ${disabled ? html`<span class="note">Spin controls disabled while an operation is running.</span>` : ''}
      </div>
    `;
  }
}
