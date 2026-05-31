import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MainDevice, DeviceType, SmartHealth, DeviceStatus } from '../types';
import { icon } from '../../shell/icons';
import { formatBytes, formatTemp, formatCount, formatPct } from '../format';

export type UtilStyle = 'bar' | 'ring';

// Device-type → icon key (icons.ts) and short tag label.
const TYPE_ICON: Record<DeviceType, string> = {
  hdd: 'harddisk', ssd: 'ssd', nvme: 'nvme', usb: 'usb',
};
const TYPE_LABEL: Record<DeviceType, string> = {
  hdd: 'HDD', ssd: 'SSD', nvme: 'NVMe', usb: 'USB',
};

// Statuses that read as a problem (red name + red border) — mirrors the row.
const PROBLEM: DeviceStatus[] = ['invalid', 'wrong', 'disabled', 'missing', 'unmountable'];

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
function smartClass(s: SmartHealth): string {
  return s === 'healthy' ? 'smart-ok' : s === 'warning' ? 'smart-warn'
    : s === 'failed' ? 'smart-fail' : 'muted';
}

@customElement('md-main-device-tile')
export class MdMainDeviceTile extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; gap: 13px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 14px 15px 13px;
      box-shadow: 0 1px 2px rgba(0,0,0,.20), 0 1px 3px rgba(0,0,0,.12);
      transition: box-shadow 120ms cubic-bezier(.2,0,0,1), border-color 120ms cubic-bezier(.2,0,0,1);
      color: var(--text-primary); font-size: 13px;
    }
    :host(:hover) { border-color: var(--border-default); box-shadow: 0 1px 2px rgba(0,0,0,.20), 0 4px 12px rgba(0,0,0,.22); }
    :host([data-problem]) { border-color: rgba(239,68,68,.45); }
    :host([data-standby]) { opacity: .82; }

    .head { display: flex; align-items: center; gap: 11px; }
    .icon { width: 36px; height: 36px; flex: 0 0 auto; border-radius: var(--radius-md); display: grid; place-items: center; background: var(--bg-elevated); color: var(--text-secondary); }
    .icon svg { width: 21px; height: 21px; fill: currentColor; }
    :host([data-type="nvme"]) .icon { color: var(--mui-accent); background: var(--mui-accent-muted); }
    .id { min-width: 0; flex: 1; }
    .name { display: flex; align-items: center; gap: 7px; }
    .name a { font-size: 14.5px; font-weight: 600; color: var(--text-primary); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name a:hover { color: var(--mui-accent); text-decoration: underline; }
    :host([data-problem]) .name a { color: var(--danger); }
    .tag { flex: 0 0 auto; font-size: 9.5px; font-weight: 700; letter-spacing: .04em; padding: 1px 5px; border-radius: var(--radius-xs); background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-subtle); text-transform: uppercase; }
    .model { font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; font-family: var(--font-mono); }

    .state { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500; color: var(--text-secondary); }
    .state .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--st); box-shadow: 0 0 0 2px color-mix(in srgb, var(--st) 22%, transparent); }
    .state.s-active { --st: var(--success); }
    .state.s-standby { --st: var(--text-muted); }
    .state.s-problem { --st: var(--danger); color: var(--danger); }

    /* bar */
    .cap { display: flex; flex-direction: column; gap: 7px; }
    .cap-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .cap-used { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .cap-total { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .cap-pct { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .bar { height: 7px; border-radius: var(--radius-full); background: var(--bg-elevated); overflow: hidden; }
    .bar > span { display: block; height: 100%; background: var(--mui-accent); border-radius: inherit; }
    .bar > span.high { background: var(--warning); }
    .bar > span.full { background: var(--danger); }

    /* ring */
    .cap-ring { display: flex; align-items: center; gap: 14px; }
    .ring { --p: 0; --col: var(--mui-accent); position: relative; width: 66px; height: 66px; flex: 0 0 auto; }
    .ring .arc { width: 100%; height: 100%; border-radius: 50%; background: conic-gradient(var(--col) calc(var(--p) * 3.6deg), var(--bg-elevated) 0); }
    .ring .hole { position: absolute; inset: 8px; border-radius: 50%; background: var(--bg-surface); display: grid; place-items: center; }
    .ring .hole .pct { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1; }
    .ring.high { --col: var(--warning); }
    .ring.full { --col: var(--danger); }
    .nums { min-width: 0; }
    .nums .u { font-size: 14.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .nums .t { font-size: 11.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; margin-top: 1px; }
    .nums .free { font-size: 11.5px; color: var(--text-muted); margin-top: 5px; }

    /* no-fs caption (parity / unmountable) */
    .nofs { font-size: 12.5px; color: var(--text-muted); display: flex; align-items: center; gap: 7px; }
    .nofs .sz { color: var(--text-secondary); font-weight: 600; font-variant-numeric: tabular-nums; }

    /* footer */
    .foot { display: flex; align-items: center; padding-top: 11px; border-top: 1px solid var(--border-subtle); }
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 0 12px; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .chip:first-child { padding-left: 0; }
    .chip + .chip { border-left: 1px solid var(--border-subtle); }
    .chip svg { width: 14px; height: 14px; fill: currentColor; opacity: .85; }
    .chip .gly { font-weight: 700; }
    .chip.smart-ok .gly { color: var(--success); }
    .chip.smart-warn .gly { color: var(--warning); }
    .chip.smart-fail .gly { color: var(--danger); }
    .chip.err-bad { color: var(--danger); font-weight: 600; }
    .chip.muted { color: var(--text-muted); }
  `;

  @property({ type: Object }) device!: MainDevice;
  @property({ type: String }) util: UtilStyle = 'bar';

  // Reflect state to host attributes for the :host([...]) styling hooks.
  willUpdate() {
    const d = this.device;
    if (!d) return;
    const problem = PROBLEM.includes(d.status);
    this.toggleAttribute('data-problem', problem);
    this.toggleAttribute('data-standby', d.spunDown && !problem);
    this.dataset.type = d.deviceType;
  }

  render() {
    const d = this.device;
    if (!d) return html``;

    const problem = PROBLEM.includes(d.status);
    const stateCls = problem ? 's-problem' : d.spunDown ? 's-standby' : 's-active';
    const util = d.utilizationPct;
    const thr = util === null ? '' : util >= 95 ? 'full' : util >= 85 ? 'high' : '';
    const isParity = d.role === 'parity';

    return html`
      <div class="head">
        <span class="icon">${icon(TYPE_ICON[d.deviceType], 21)}</span>
        <span class="id">
          <span class="name">
            <a href=${d.detailHref}>${d.name}</a>
            <span class="tag">${TYPE_LABEL[d.deviceType]}</span>
          </span>
          <div class="model" title=${d.model}>${d.model || '—'}</div>
        </span>
        <span class="state ${stateCls}"><span class="dot"></span>${statusLabel(d)}</span>
      </div>

      ${this.renderCapacity(isParity, util, thr)}

      <div class="foot">
        <span class="chip ${d.tempC === null ? 'muted' : ''}">
          ${icon('thermometer', 14)}${formatTemp(d.tempC)}
        </span>
        <span class="chip ${smartClass(d.smart)}">
          <span class="gly">${smartGlyph(d.smart)}</span> SMART
        </span>
        <span class="chip ${(d.numErrors ?? 0) > 0 ? 'err-bad' : 'muted'}">
          ${formatCount(d.numErrors)} err
        </span>
      </div>
    `;
  }

  private renderCapacity(isParity: boolean, util: number | null, thr: string) {
    const d = this.device;
    if (isParity) {
      return html`<div class="nofs"><span class="sz">${formatBytes(d.sizeBytes)}</span> · parity device (no filesystem)</div>`;
    }
    if (util === null) {
      return html`<div class="nofs">Filesystem not mounted · <span class="sz">${formatBytes(d.sizeBytes)}</span></div>`;
    }
    if (this.util === 'ring') {
      return html`
        <div class="cap-ring">
          <div class="ring ${thr}" style=${`--p:${Math.min(100, util)}`}>
            <div class="arc"></div>
            <div class="hole"><span class="pct">${formatPct(util)}</span></div>
          </div>
          <div class="nums">
            <div class="u">${formatBytes(d.fsUsedBytes)}</div>
            <div class="t">of ${formatBytes(d.fsSizeBytes)}</div>
            <div class="free">${formatBytes(d.fsFreeBytes)} free</div>
          </div>
        </div>`;
    }
    return html`
      <div class="cap">
        <div class="cap-top">
          <span class="cap-used">${formatBytes(d.fsUsedBytes)}</span>
          <span class="cap-total">/ ${formatBytes(d.fsSizeBytes)}</span>
          <span class="cap-pct">${formatPct(util)}</span>
        </div>
        <div class="bar"><span class=${thr} style=${`width:${Math.min(100, util)}%`}></span></div>
      </div>`;
  }
}
