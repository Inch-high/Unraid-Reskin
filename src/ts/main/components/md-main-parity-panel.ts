import { LitElement, html, css } from 'lit';
import type { TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ParityState, OperationState } from '../types';
import { formatBytes, formatPct } from '../format';
import * as A from '../actions';

// Parity / sync / clear controls + progress + last-check summary. When idle and
// the array is Started, offers the applicable operation (Check/Sync/Clear);
// while running, offers Pause/Resume + Cancel with live progress.
@customElement('md-main-parity-panel')
export class MdMainParityPanel extends LitElement {
  static styles = css`
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 6px 0; }
    button {
      background: var(--bg-elevated); color: var(--text-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-sm);
      padding: 6px 14px; font: inherit; cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--mui-accent); color: var(--mui-accent); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
    .bar { flex: 1 1 200px; height: 8px; border-radius: var(--radius-full); background: var(--border-subtle); overflow: hidden; }
    .bar > span { display: block; height: 100%; background: var(--mui-accent); }
    .meta { font-size: 12.5px; color: var(--text-secondary); }
    .meta strong { color: var(--text-primary); }
  `;

  @property({ type: Object }) parity!: ParityState;
  @property({ type: Object }) operation!: OperationState;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  private _correct = true;

  private async _run(req: A.ActionRequest): Promise<void> {
    await A.submit(req, this.csrf);
    this.resync();
  }
  private async _pause(): Promise<void> {
    await A.submitParityPause(this.csrf);
    this.resync();
  }
  private async _resume(): Promise<void> {
    await A.submitParityResume(this.csrf);
    this.resync();
  }

  render() {
    const p = this.parity;
    if (!p) return html``;
    const started = this.operation?.fsState === 'Started';

    if (p.running || p.paused) {
      const op =
        p.action === 'recon' ? 'Sync' : p.action === 'clear' ? 'Disk-Clear' : 'Parity-Check';
      return html`
        <div class="row">
          <span class="meta"><strong>${op}</strong> in progress</span>
          <span class="bar"><span style=${`width:${p.pct ?? 0}%`}></span></span>
          <span class="meta">${formatPct(p.pct)}${
            p.posBytes !== null && p.sizeBytes !== null
              ? html` · ${formatBytes(p.posBytes)} / ${formatBytes(p.sizeBytes)}`
              : ''
          }</span>
        </div>
        <div class="row">
          ${
            p.paused
              ? html`<button @click=${this._resume}>Resume</button>`
              : html`<button @click=${this._pause}>Pause</button>`
          }
          <button @click=${() => {
            if (
              confirm(
                'Cancel the running parity operation? Canceling may leave the array unprotected.',
              )
            )
              void this._run(A.buildParityCancel());
          }}>Cancel</button>
          ${p.errors !== null ? html`<span class="meta">${p.errors} error(s)</span>` : ''}
        </div>
      `;
    }

    if (!started) return html``;

    // Idle + Started: offer the applicable operation.
    let control: TemplateResult;
    if (p.action === 'recon') {
      control = html`<button @click=${() => this._run(A.buildSync())}>Sync</button>
        <span class="meta">Will start the parity sync / rebuild.</span>`;
    } else if (p.action === 'clear') {
      control = html`<button @click=${() => this._run(A.buildClear())}>Clear</button>
        <span class="meta">Will start Disk-Clear of new data disk(s).</span>`;
    } else {
      control = html`
        <button @click=${() => this._run(A.buildParityCheck(this._correct))}>Check</button>
        <label class="check"><input type="checkbox" .checked=${this._correct}
          @change=${(e: Event) => {
            this._correct = (e.target as HTMLInputElement).checked;
          }}>
          Write corrections to parity</label>`;
    }

    return html`
      <div class="row">${control}</div>
      ${
        p.last
          ? html`<div class="meta">Last check completed <strong>${p.last.date}</strong>${
              p.last.durationText ? html` · ${p.last.durationText}` : ''
            } · ${p.last.errors} error(s)</div>`
          : ''
      }
    `;
  }
}
