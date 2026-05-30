import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-row';
import type { MainPool } from '../types';
import { formatBytes, formatPct } from '../format';

// One pool/cache card. Title is the pool name, with a status pill (ONLINE /
// DEGRADED / OFFLINE) and a profile + usage summary.
@customElement('md-main-pool-card')
export class MdMainPoolCard extends MdMainCardBase {
  @property({ type: Object }) pool!: MainPool;
  @property({ type: Boolean }) compact = false;

  render() {
    const p = this.pool;
    if (!p) return html``;
    const statusClass = ['online', 'degraded', 'offline'].includes(p.status) ? p.status : 'unknown';
    return html`
      <div class="card">
        <div class="card-head">
          <div class="title">
            <h2>${p.label}</h2>
            ${p.statusText
              ? html`<span class="pill ${statusClass}">${p.statusText.replace(/^Status:\s*/i, '') || p.status}</span>`
              : ''}
            ${p.fsProfile ? html`<span class="totals">${p.fsType ?? ''} · ${p.fsProfile}</span>` : ''}
          </div>
          ${p.sizeBytes !== null
            ? html`<span class="totals">
                <strong>${formatBytes(p.usedBytes)}</strong> used of
                <strong>${formatBytes(p.sizeBytes)}</strong>
                ${p.utilizationPct !== null ? html`(${formatPct(p.utilizationPct)})` : ''}
              </span>`
            : ''}
        </div>
        <div class="rows">
          ${this.renderColHead()}
          ${p.devices.map(
            (d) => html`<md-main-device-row .device=${d} ?compact=${this.compact}></md-main-device-row>`,
          )}
        </div>
      </div>
    `;
  }
}
