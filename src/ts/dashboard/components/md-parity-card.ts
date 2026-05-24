import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ParityState, ParityStatus } from '../types';
import './md-card';

function statusPill(s: ParityStatus) {
  const map: Record<ParityStatus, { text: string; color: string }> = {
    valid:    { text: 'Valid',    color: 'var(--success)' },
    running:  { text: 'Running',  color: 'var(--info)' },
    invalid:  { text: 'Invalid',  color: 'var(--danger)' },
    disabled: { text: 'Disabled', color: 'var(--text-muted)' },
    unknown:  { text: 'Unknown',  color: 'var(--text-muted)' },
  };
  const { text, color } = map[s];
  return html`<span style="
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    background: ${color}26; color: ${color};
  ">${text}</span>`;
}

@customElement('md-parity-card')
export class MdParityCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      gap: 12px;
    }
    .row:last-child { border-bottom: none; }
    .label { color: var(--text-secondary); flex-shrink: 0; }
    .value { color: var(--text-primary); font-weight: 500; text-align: right; }
  `;

  @property({ type: Object }) state: ParityState = {
    kind: 'parity',
    status: 'unknown',
    lastCheckText: null,
    durationText: null,
    averageSpeedMBs: null,
    errorsFound: null,
    scheduleEnabled: false,
  };

  render() {
    const s = this.state;
    return html`
      <md-card cardTitle="Parity">
        <div style="margin-bottom: 12px">${statusPill(s.status)}</div>
        ${s.lastCheckText ? html`<div class="row"><span class="label">Last check</span><span class="value">${s.lastCheckText}</span></div>` : ''}
        ${s.durationText ? html`<div class="row"><span class="label">Duration</span><span class="value">${s.durationText}</span></div>` : ''}
        ${s.averageSpeedMBs !== null ? html`<div class="row"><span class="label">Average speed</span><span class="value">${s.averageSpeedMBs} MB/s</span></div>` : ''}
        ${s.errorsFound !== null ? html`<div class="row"><span class="label">Errors found</span><span class="value">${s.errorsFound}</span></div>` : ''}
        <div class="row"><span class="label">Schedule</span><span class="value">${s.scheduleEnabled ? 'Enabled' : 'Disabled'}</span></div>
      </md-card>
    `;
  }
}
