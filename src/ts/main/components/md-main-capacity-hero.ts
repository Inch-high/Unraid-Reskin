import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MainArray, DeviceStatus } from '../types';
import { formatBytes } from '../format';

const PROBLEM: DeviceStatus[] = ['invalid', 'wrong', 'disabled', 'missing', 'unmountable'];

// Array-wide capacity + protection summary, sitting above the device tiles.
// Replaces the per-card totals footer of the v0.6.0 cards.
@customElement('md-main-capacity-hero')
export class MdMainCapacityHero extends LitElement {
  static styles = css`
    :host { display: block; margin: 0 0 22px; }
    .hero {
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); padding: 18px 20px;
      display: grid; grid-template-columns: 1fr auto; gap: 18px 28px; align-items: center;
    }
    .cap { min-width: 0; }
    .cap-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .used { font-size: 26px; font-weight: 650; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
    .total { font-size: 14px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .free { margin-left: auto; font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .free b { color: var(--text-primary); font-weight: 600; }
    .bar { height: 10px; border-radius: var(--radius-full); background: var(--bg-elevated); overflow: hidden; }
    .bar > span { display: block; height: 100%; background: var(--mui-accent); }
    .bar > span.high { background: var(--warning); }
    .stats { display: flex; gap: 26px; }
    .stat { text-align: right; }
    .stat .v { font-size: 18px; font-weight: 600; }
    .stat .v.ok { color: var(--success); }
    .stat .l { font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; }
    @media (max-width: 720px) {
      .hero { grid-template-columns: 1fr; }
      .stats { justify-content: space-between; }
    }
  `;

  @property({ type: Object }) array!: MainArray;
  @property({ type: Boolean }) isProtected = false;

  render() {
    const a = this.array;
    if (!a) return html``;
    const parity = a.devices.filter((d) => d.role === 'parity').length;
    const data = a.devices.filter((d) => d.role === 'data').length;
    const total = a.devices.length;
    const healthy = a.devices.filter(
      (d) => !PROBLEM.includes(d.status) && d.smart !== 'failed',
    ).length;
    const pct = a.utilizationPct;

    return html`
      <div class="hero">
        <div class="cap">
          <div class="cap-top">
            <span class="used">${formatBytes(a.usedBytes)}</span>
            <span class="total">used of ${formatBytes(a.sizeBytes)}</span>
            <span class="free"><b>${formatBytes(a.freeBytes)}</b> free</span>
          </div>
          <div class="bar"><span class=${pct !== null && pct >= 85 ? 'high' : ''} style=${`width:${Math.min(100, pct ?? 0)}%`}></span></div>
        </div>
        <div class="stats">
          <div class="stat"><div class="v ${this.isProtected ? 'ok' : ''}">${this.isProtected ? 'Valid' : 'Unprotected'}</div><div class="l">Parity protection</div></div>
          <div class="stat"><div class="v">${parity} + ${data}</div><div class="l">Parity + data</div></div>
          <div class="stat"><div class="v">${healthy} / ${total}</div><div class="l">Devices healthy</div></div>
        </div>
      </div>
    `;
  }
}
