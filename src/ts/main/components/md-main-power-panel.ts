import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import * as A from '../actions';

// Mover (Move/Empty), Reboot, Shutdown. Each destructive button confirms first.
@customElement('md-main-power-panel')
export class MdMainPowerPanel extends LitElement {
  static styles = css`
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    button {
      background: var(--bg-elevated); color: var(--text-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-sm);
      padding: 6px 14px; font: inherit; cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--mui-accent); color: var(--mui-accent); }
    button.danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
  `;

  @property({ type: Boolean }) moverEnabled = false;
  @property({ type: Boolean }) moverRunning = false;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  @state() private _safemode = false;

  private async _run(req: A.ActionRequest): Promise<void> {
    await A.submit(req, this.csrf);
    this.resync();
  }

  render() {
    return html`
      <div class="row">
        ${
          this.moverEnabled
            ? html`<button ?disabled=${this.moverRunning}
              @click=${() => this._run(A.buildMover(false))}>${this.moverRunning ? 'Mover running…' : 'Move'}</button>`
            : ''
        }
        <button class="danger"
          @click=${() => {
            if (confirm('Reboot the server now?')) void this._run(A.buildReboot(this._safemode));
          }}>Reboot</button>
        <button class="danger"
          @click=${() => {
            if (confirm('Shut down the server now?')) void this._run(A.buildShutdown());
          }}>Shutdown</button>
        <label class="check"><input type="checkbox" .checked=${this._safemode}
          @change=${(e: Event) => {
            this._safemode = (e.target as HTMLInputElement).checked;
          }}>
          safe mode (next boot)</label>
      </div>
    `;
  }
}
