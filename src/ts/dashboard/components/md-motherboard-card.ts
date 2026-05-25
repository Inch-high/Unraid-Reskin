import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MotherboardState } from '../types';
import './md-card';

@customElement('md-motherboard-card')
export class MdMotherboardCard extends LitElement {
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

  @property({ type: Object }) state: MotherboardState = {
    kind: 'motherboard',
    vendor: '',
    biosVendor: '',
    biosDated: '',
  };

  render() {
    const s = this.state;
    return html`
      <md-card cardTitle="Motherboard">
        <div class="row"><span class="label">Board</span><span class="value">${s.vendor || '—'}</span></div>
        <div class="row"><span class="label">BIOS</span><span class="value">${s.biosVendor || '—'}</span></div>
        <div class="row"><span class="label">Dated</span><span class="value">${s.biosDated || '—'}</span></div>
      </md-card>
    `;
  }
}
