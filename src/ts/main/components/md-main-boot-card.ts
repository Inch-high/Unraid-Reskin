import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-row';
import type { MainDevice } from '../types';
import { formatBytes, formatPct } from '../format';

// "Boot Device" card — the single flash device.
@customElement('md-main-boot-card')
export class MdMainBootCard extends MdMainCardBase {
  @property({ type: Object }) device!: MainDevice;
  @property({ type: Boolean }) compact = false;

  render() {
    const d = this.device;
    if (!d) return html``;
    return html`
      <div class="card">
        <div class="card-head">
          <div class="title"><h2>Boot Device</h2></div>
          ${d.fsSizeBytes !== null
            ? html`<span class="totals">
                <strong>${formatBytes(d.fsUsedBytes)}</strong> used of
                <strong>${formatBytes(d.fsSizeBytes)}</strong>
                ${d.utilizationPct !== null ? html`(${formatPct(d.utilizationPct)})` : ''}
              </span>`
            : ''}
        </div>
        <div class="rows">
          ${this.renderColHead()}
          <md-main-device-row .device=${d} ?compact=${this.compact}></md-main-device-row>
        </div>
      </div>
    `;
  }
}
