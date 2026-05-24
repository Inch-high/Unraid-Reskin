import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-sparkline')
export class MdSparkline extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; height: 32px; }
    svg { width: 100%; height: 100%; display: block; }
  `;

  @property({ type: Array }) values: number[] = [];
  @property({ type: Number }) max = 100;

  render() {
    if (this.values.length < 2) return html`<svg viewBox="0 0 100 32"></svg>`;
    const pts = this.values
      .map((v, i) => {
        const x = (i / (this.values.length - 1)) * 100;
        const y = 32 - (Math.min(v, this.max) / this.max) * 32;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
    return html`
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
}
