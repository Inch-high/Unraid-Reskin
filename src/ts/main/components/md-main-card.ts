import { LitElement, html, css, type TemplateResult, type CSSResultGroup } from 'lit';
import './md-main-device-tile';
import type { MainDevice } from '../types';
import type { UtilStyle } from './md-main-device-tile';

// Shared chrome + helpers for the /Main cards.
//   • Card chrome (.card/.card-head/.pill) — used by the Unassigned Devices card,
//     which keeps a tabular layout.
//   • Section + tile-grid (.section-head/.grid + renderTiles()) — used by the
//     array/pool/boot device cards, which render a responsive grid of
//     <md-main-device-tile> instead of the old full-width rows.
export class MdMainCardBase extends LitElement {
  static styles: CSSResultGroup = css`
    :host { display: block; margin: 0 0 22px; }

    /* card chrome — still used by the Unassigned Devices card */
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
    .totals { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
    .totals strong { color: var(--text-primary); font-weight: 600; }

    /* status pills (pool status) */
    .pill {
      font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full);
      text-transform: uppercase; letter-spacing: .04em;
    }
    .pill.online { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
    .pill.degraded { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--warning); }
    .pill.offline { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
    .pill.unknown { background: var(--bg-elevated); color: var(--text-secondary); }

    /* section header + tile grid — array / pool / boot device groups */
    .section-head { display: flex; align-items: center; gap: 12px; margin: 0 2px 12px; flex-wrap: wrap; }
    .section-title { font-size: 15px; font-weight: 650; color: var(--text-primary); }
    .section-meta { font-size: 12.5px; color: var(--text-secondary); }
    .section-spacer { flex: 1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(252px, 1fr)); gap: 12px; }

    /* led strip — whole-group state glance */
    .leds { display: flex; gap: 4px; }
    .led { width: 11px; height: 16px; border-radius: 2px; background: var(--text-muted); }
  `;

  protected renderTiles(devices: MainDevice[], util: UtilStyle): TemplateResult {
    return html`<div class="grid">
      ${devices.map((d) => html`<md-main-device-tile .device=${d} .util=${util}></md-main-device-tile>`)}
    </div>`;
  }
}
