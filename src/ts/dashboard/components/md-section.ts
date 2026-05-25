import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-section')
export class MdSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 24px 0;
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin: 0 4px 12px 4px;
    }
    .grid {
      display: grid;
      /* Larger minimum so wide layouts (≥1900px frame) settle into 3 evenly
         spread columns — the typical Compute / Network & Power / System
         sections fit naturally with no empty trailing cells, and on narrow
         viewports it gracefully drops to 2 then 1 column. */
      grid-template-columns: repeat(auto-fill, minmax(560px, 1fr));
      gap: 16px;
    }
    ::slotted([data-wide]) {
      grid-column: 1 / -1;
    }
  `;

  @property({ type: String }) label = '';

  render() {
    return html`
      <div class="label">${this.label}</div>
      <div class="grid"><slot></slot></div>
    `;
  }
}
