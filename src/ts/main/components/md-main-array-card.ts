import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-row';
import type { MainArray } from '../types';
import { formatBytes, formatPct } from '../format';

// "Array Devices" card — parity + data disks (already ordered parity-first by
// the snapshot). Totals reflect the data members' filesystem usage.
@customElement('md-main-array-card')
export class MdMainArrayCard extends MdMainCardBase {
  @property({ type: Object }) array!: MainArray;
  @property({ type: Boolean }) compact = false;

  render() {
    const a = this.array;
    if (!a) return html``;
    const hasTotals = a.sizeBytes !== null;
    return html`
      <div class="card">
        <div class="card-head">
          <div class="title"><h2>Array Devices</h2></div>
          ${hasTotals
            ? html`<span class="totals">
                <strong>${formatBytes(a.usedBytes)}</strong> used of
                <strong>${formatBytes(a.sizeBytes)}</strong>
                ${a.utilizationPct !== null ? html`(${formatPct(a.utilizationPct)})` : ''}
              </span>`
            : ''}
        </div>
        <div class="rows">
          ${this.renderColHead()}
          ${a.devices.map(
            (d) => html`<md-main-device-row .device=${d} ?compact=${this.compact}></md-main-device-row>`,
          )}
        </div>
      </div>
    `;
  }
}
