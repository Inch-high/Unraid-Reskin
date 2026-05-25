import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * A single hero cell. The strip wires four of these up with their own
 * label / numbers / visual slot content. The card handles click navigation:
 * - if `expanderTarget` is non-empty, open the matching <details> first
 * - then scrollIntoView on the `scrollTarget` element
 *
 * The card lives two shadow-root levels below <modernui-dashboard>, so the
 * click handler walks up via getRootNode().host.getRootNode() to reach the
 * dashboard's shadow root, then queries for sibling cards there.
 */
@customElement('md-hero-card')
export class MdHeroCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 1px 3px rgba(0, 0, 0, 0.12);
      transition: box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
      cursor: pointer;
      user-select: none;
    }
    :host(:hover) {
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 2px 6px rgba(0, 0, 0, 0.18);
    }
    .body {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 20px 20px;
      min-height: 140px;
      box-sizing: border-box;
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
    .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .sub {
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .visual {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 56px;
    }

    /* Twin-stat layout (e.g. Workloads with separate Containers + VMs) */
    .body.twin {
      display: flex;
      flex-direction: column;
      gap: 12px;
      grid-template-columns: none;
    }
    .body.twin .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
    .body.twin .cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      flex: 1;
      align-items: center;
    }
    .body.twin .col {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    .body.twin .col .big {
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .body.twin .col .lbl {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
  `;

  @property({ type: String }) label = '';
  @property({ type: String }) bigText = '—';
  @property({ type: String }) subText = '';
  @property({ type: String }) scrollTarget = '';
  @property({ type: String }) expanderTarget = '';
  // Twin-stat mode: two side-by-side big numbers with their own labels.
  // When `twin` is true, the four left*/right* props are used instead of
  // bigText/subText, and the default visual slot is ignored.
  @property({ type: Boolean }) twin = false;
  @property({ type: String }) leftBig = '';
  @property({ type: String }) leftLabel = '';
  @property({ type: String }) rightBig = '';
  @property({ type: String }) rightLabel = '';

  private _onClick(): void {
    if (!this.scrollTarget) return;

    const stripRoot = this.getRootNode() as ShadowRoot;
    const dashboardRoot = (stripRoot.host?.getRootNode() as ShadowRoot) ?? null;
    if (!dashboardRoot) return;

    const targetCard = dashboardRoot.querySelector(this.scrollTarget) as HTMLElement | null;
    if (!targetCard) return;

    if (this.expanderTarget) {
      const details = targetCard.shadowRoot?.querySelector(
        `[data-hero-expander="${this.expanderTarget}"]`,
      ) as HTMLDetailsElement | null;
      if (details && !details.open) details.open = true;
    }

    requestAnimationFrame(() => {
      targetCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  render() {
    if (this.twin) {
      return html`
        <div class="body twin" @click=${this._onClick}>
          <span class="label">${this.label}</span>
          <div class="cols">
            <div class="col">
              <span class="big">${this.leftBig}</span>
              <span class="lbl">${this.leftLabel}</span>
            </div>
            <div class="col">
              <span class="big">${this.rightBig}</span>
              <span class="lbl">${this.rightLabel}</span>
            </div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="body" @click=${this._onClick}>
        <div class="text">
          <span class="label">${this.label}</span>
          <span class="big">${this.bigText}</span>
          ${this.subText ? html`<span class="sub">${this.subText}</span>` : ''}
        </div>
        <div class="visual">
          <slot></slot>
        </div>
      </div>
    `;
  }
}
