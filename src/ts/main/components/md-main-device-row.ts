import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MainDevice, OrbColor, SmartHealth, DeviceStatus } from '../types';
import { formatBytes, formatTemp, formatCount, formatPct } from '../format';

// Shared 11-column grid template — reused by each card's header row so the
// header and every device row line up (each row is its own grid with an
// identical template; tracks resolve to the same widths at the same container
// width). Columns: Device · Identification · Temp · Reads · Writes · Errors ·
// FS · Size · Used · Free · Utilization.
export const MAIN_ROW_COLUMNS =
  'minmax(150px,1.5fr) minmax(170px,2fr) 64px 92px 92px 64px 96px 86px 86px 86px minmax(120px,1.3fr)';

const ORB_VAR: Record<OrbColor, string> = {
  green: 'var(--success)',
  yellow: 'var(--warning)',
  red: 'var(--danger)',
  grey: 'var(--text-muted)',
};

// Short human label for the device status, shown under the device name.
function statusLabel(d: MainDevice): string {
  switch (d.status) {
    case 'ok':          return d.spunDown ? 'standby' : 'active';
    case 'new':         return 'new device';
    case 'invalid':     return 'invalid';
    case 'wrong':       return 'wrong';
    case 'disabled':    return 'disabled';
    case 'missing':     return 'missing';
    case 'unmountable': return 'unmountable';
    case 'notpresent':  return 'not installed';
    default:            return '';
  }
}

function smartGlyph(s: SmartHealth): string {
  return s === 'healthy' ? '✓' : s === 'warning' ? '!' : s === 'failed' ? '✕' : '?';
}
function smartVar(s: SmartHealth): string {
  return s === 'healthy' ? 'var(--success)'
    : s === 'warning' ? 'var(--warning)'
    : s === 'failed' ? 'var(--danger)' : 'var(--text-muted)';
}

// Statuses that should read as a problem (red name).
const PROBLEM: DeviceStatus[] = ['invalid', 'wrong', 'disabled', 'missing', 'unmountable'];

@customElement('md-main-device-row')
export class MdMainDeviceRow extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: var(--main-row-cols);
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 13px;
      color: var(--text-primary);
    }
    :host([compact]) { padding: 5px 14px; font-size: 12px; }
    .device { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .orb {
      flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%;
      background: var(--orb); box-shadow: 0 0 0 2px color-mix(in srgb, var(--orb) 22%, transparent);
    }
    .name { display: flex; flex-direction: column; min-width: 0; }
    .name a {
      color: var(--text-primary); text-decoration: none; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .name a:hover { color: var(--mui-accent); text-decoration: underline; }
    .name a.problem { color: var(--danger); }
    .substate { font-size: 11px; color: var(--text-secondary); }
    .ident { min-width: 0; display: flex; align-items: center; gap: 8px; }
    .ident .text { min-width: 0; }
    .model { color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .serial { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .smart { flex: 0 0 auto; font-weight: 700; color: var(--smart); cursor: default; }
    .num { font-variant-numeric: tabular-nums; text-align: right; color: var(--text-secondary); }
    .num.err-bad { color: var(--danger); font-weight: 600; }
    .center { text-align: center; color: var(--text-secondary); }
    .util { display: flex; align-items: center; gap: 8px; }
    .bar { flex: 1; height: 6px; border-radius: var(--radius-full); background: var(--border-subtle); overflow: hidden; }
    .bar > span { display: block; height: 100%; background: var(--mui-accent); border-radius: inherit; }
    .bar > span.high { background: var(--warning); }
    .bar > span.full { background: var(--danger); }
    .util .pct { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text-secondary); min-width: 38px; text-align: right; }
    .dash { color: var(--text-muted); }
  `;

  @property({ type: Object }) device!: MainDevice;
  @property({ type: Boolean, reflect: true }) compact = false;

  render() {
    const d = this.device;
    if (!d) return html``;
    const util = d.utilizationPct;
    const barClass = util === null ? '' : util >= 95 ? 'full' : util >= 85 ? 'high' : '';
    const isProblem = PROBLEM.includes(d.status);
    const showFs = d.role !== 'parity';

    return html`
      <div class="device" style=${`--orb:${ORB_VAR[d.orb]}`}>
        <span class="orb" title=${d.spunDown ? 'Standby (spun down)' : 'Active'}></span>
        <span class="name">
          <a href=${d.detailHref} class=${isProblem ? 'problem' : ''}>${d.name}</a>
          <span class="substate">${statusLabel(d)}</span>
        </span>
      </div>

      <div class="ident">
        <div class="text">
          <div class="model" title=${d.model}>${d.model || '—'}</div>
          ${d.serial ? html`<div class="serial" title=${d.serial}>${d.serial}</div>` : ''}
        </div>
        ${showFs
          ? html`<span class="smart" style=${`--smart:${smartVar(d.smart)}`}
              title=${`SMART: ${d.smart}`}>${smartGlyph(d.smart)}</span>`
          : ''}
      </div>

      <div class="center">${formatTemp(d.tempC)}</div>
      <div class="num">${formatCount(d.numReads)}</div>
      <div class="num">${formatCount(d.numWrites)}</div>
      <div class="num ${(d.numErrors ?? 0) > 0 ? 'err-bad' : ''}">${formatCount(d.numErrors)}</div>
      <div class="center">${showFs ? (d.fsType ?? html`<span class="dash">—</span>`) : html`<span class="dash">—</span>`}</div>
      <div class="num">${formatBytes(d.sizeBytes)}</div>
      <div class="num">${showFs ? formatBytes(d.fsUsedBytes) : html`<span class="dash">—</span>`}</div>
      <div class="num">${showFs ? formatBytes(d.fsFreeBytes) : html`<span class="dash">—</span>`}</div>

      <div class="util">
        ${util === null
          ? html`<span class="dash">—</span>`
          : html`<span class="bar"><span class=${barClass} style=${`width:${Math.min(100, util)}%`}></span></span>
                 <span class="pct">${formatPct(util)}</span>`}
      </div>
    `;
  }
}
