import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-card')
export class MdCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 1px 3px rgba(0, 0, 0, 0.12);
      transition: box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
      overflow: hidden;
    }
    :host(:hover) {
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 2px 6px rgba(0, 0, 0, 0.18);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px 20px;
      gap: 12px;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      flex: 1;
      min-width: 0;
    }
    .meta {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 400;
    }
    .body {
      padding: 0 20px 18px 20px;
      color: var(--text-primary);
      font-size: 14px;
    }
    ::slotted(*) {
      box-sizing: border-box;
    }
  `;

  @property({ type: String }) cardTitle = '';
  @property({ type: String }) meta = '';

  render() {
    return html`
      <div class="header">
        <h3 class="title">${this.cardTitle}</h3>
        ${this.meta ? html`<span class="meta">${this.meta}</span>` : ''}
      </div>
      <div class="body">
        <slot></slot>
      </div>
    `;
  }
}
