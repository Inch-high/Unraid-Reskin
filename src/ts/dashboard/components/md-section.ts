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
      /* The min(560px, 100%) idiom: when the section's container (the
         dashboard's left sidebar at ~458px wide) is narrower than 560px,
         the per-cell minimum drops to 100% so the grid stays one column
         instead of forcing a 560px-wide cell that overflows by ~100px and
         covers the right column's content (the visible "clipping" bug).
         At ≥560px containers behavior is unchanged — 2 or 3 columns based
         on width with a 560px target. */
      grid-template-columns: repeat(auto-fill, minmax(min(560px, 100%), 1fr));
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
