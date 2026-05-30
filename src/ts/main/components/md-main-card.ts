import { LitElement, html, css, unsafeCSS, type TemplateResult } from 'lit';
import { MAIN_ROW_COLUMNS } from './md-main-device-row';

// Shared chrome + column-header for the three device cards (array, pool, boot).
// Subclasses implement render() and call renderColHead()/cardShell(). The
// `--main-row-cols` custom property is set on the rows container so it inherits
// into each <md-main-device-row>'s :host (custom props pierce shadow DOM), so
// the header and rows share one column template and align.
export class MdMainCardBase extends LitElement {
  static styles = css`
    :host { display: block; margin: 0 0 16px; }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .card-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; padding: 14px 16px 12px;
    }
    .card-head .title { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .card-head h2 { margin: 0; font-size: 15px; font-weight: 650; color: var(--text-primary); }
    .pill {
      font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full);
      text-transform: uppercase; letter-spacing: .04em;
    }
    .pill.online { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
    .pill.degraded { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--warning); }
    .pill.offline { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
    .pill.unknown { background: var(--bg-elevated); color: var(--text-secondary); }
    .totals { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
    .totals strong { color: var(--text-primary); font-weight: 600; }

    .rows { --main-row-cols: ${unsafeCSS(MAIN_ROW_COLUMNS)}; }
    .col-head {
      display: grid; grid-template-columns: var(--main-row-cols);
      gap: 10px; padding: 8px 14px; align-items: center;
      background: var(--bg-elevated);
      font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase;
      color: var(--text-muted);
    }
    .col-head .r { text-align: right; }
    .col-head .c { text-align: center; }
    @media (max-width: 920px) {
      .col-head { display: none; }
    }
  `;

  // The 11-column header. Labels match stock /Main + our state/SMART folding.
  protected renderColHead(): TemplateResult {
    return html`
      <div class="col-head">
        <span>Device</span>
        <span>Identification</span>
        <span class="c">Temp</span>
        <span class="r">Reads</span>
        <span class="r">Writes</span>
        <span class="r">Errors</span>
        <span class="c">FS</span>
        <span class="r">Size</span>
        <span class="r">Used</span>
        <span class="r">Free</span>
        <span>Utilization</span>
      </div>
    `;
  }
}
