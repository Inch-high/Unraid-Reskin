import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-tile';
import type { MainArray, MainDevice, DeviceStatus } from '../types';
import type { UtilStyle } from './md-main-device-tile';

const PROBLEM: DeviceStatus[] = ['invalid', 'wrong', 'disabled', 'missing', 'unmountable'];

// Per-device LED color for the whole-array glance strip.
function ledColor(d: MainDevice): string {
  if (PROBLEM.includes(d.status)) return 'var(--danger)';
  if (d.spunDown) return 'var(--text-muted)';
  return 'var(--success)';
}

// "Array" group — parity + data disks (parity-first from the snapshot) as a
// tile grid. Array-wide totals live in the capacity hero above; the header
// carries only the title + a state LED strip.
@customElement('md-main-array-card')
export class MdMainArrayCard extends MdMainCardBase {
  @property({ type: Object }) array!: MainArray;
  @property({ type: String }) util: UtilStyle = 'bar';

  render() {
    const a = this.array;
    if (!a) return html``;
    return html`
      <div class="section-head">
        <span class="section-title">Array</span>
        <span class="section-spacer"></span>
        <span class="leds">
          ${a.devices.map((d) => html`<span class="led" style=${`background:${ledColor(d)}`}></span>`)}
        </span>
      </div>
      ${this.renderTiles(a.devices, this.util)}
    `;
  }
}
