import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-tile';
import type { MainPool } from '../types';
import type { UtilStyle } from './md-main-device-tile';
import { formatBytes, formatPct } from '../format';

// One pool/cache group — name + status pill (ONLINE / DEGRADED / OFFLINE),
// profile and usage in the section header, members as a tile grid.
@customElement('md-main-pool-card')
export class MdMainPoolCard extends MdMainCardBase {
  @property({ type: Object }) pool!: MainPool;
  @property({ type: String }) util: UtilStyle = 'bar';

  render() {
    const p = this.pool;
    if (!p) return html``;
    const statusClass = ['online', 'degraded', 'offline'].includes(p.status) ? p.status : 'unknown';
    const profile = [p.fsType, p.fsProfile].filter(Boolean).join(' · ');
    const usage =
      p.sizeBytes !== null
        ? `${formatBytes(p.usedBytes)} used of ${formatBytes(p.sizeBytes)}${p.utilizationPct !== null ? ` (${formatPct(p.utilizationPct)})` : ''}`
        : '';
    const meta = [profile, usage].filter(Boolean).join(' · ');

    return html`
      <div class="section-head">
        <span class="section-title">${p.label}</span>
        ${
          p.statusText
            ? html`<span class="pill ${statusClass}">${p.statusText.replace(/^Status:\s*/i, '') || p.status}</span>`
            : ''
        }
        ${meta ? html`<span class="section-meta">${meta}</span>` : ''}
      </div>
      ${this.renderTiles(p.devices, this.util)}
    `;
  }
}
