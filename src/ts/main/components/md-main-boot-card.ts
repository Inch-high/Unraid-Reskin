import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-tile';
import type { MainDevice } from '../types';
import type { UtilStyle } from './md-main-device-tile';

// "Boot" group — the single flash device, rendered as one tile.
@customElement('md-main-boot-card')
export class MdMainBootCard extends MdMainCardBase {
  @property({ type: Object }) device!: MainDevice;
  @property({ type: String }) util: UtilStyle = 'bar';

  render() {
    const d = this.device;
    if (!d) return html``;
    return html`
      <div class="section-head">
        <span class="section-title">Boot</span>
        ${d.fsType ? html`<span class="section-meta">${d.fsType} · flash device</span>` : ''}
      </div>
      ${this.renderTiles([d], this.util)}
    `;
  }
}
