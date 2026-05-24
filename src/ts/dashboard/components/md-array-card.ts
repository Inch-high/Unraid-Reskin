import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ArrayState, DiskState, SmartHealth } from '../types';
import './md-card';

function stateColor(s: DiskState): string {
  if (s === 'active') return 'var(--success)';
  if (s === 'standby') return 'var(--text-muted)';
  if (s === 'spinning-up') return 'var(--warning)';
  if (s === 'unmounted') return 'var(--danger)';
  return 'var(--text-muted)';
}
function smartIcon(s: SmartHealth): string {
  return s === 'healthy' ? '✓' : s === 'warning' ? '!' : s === 'failed' ? '✕' : '?';
}
function smartColor(s: SmartHealth): string {
  if (s === 'healthy') return 'var(--success)';
  if (s === 'warning') return 'var(--warning)';
  if (s === 'failed') return 'var(--danger)';
  return 'var(--text-muted)';
}

@customElement('md-array-card')
export class MdArrayCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .leds { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 16px; }
    .led { width: 14px; height: 18px; border-radius: 2px; background: var(--text-muted); }
    .disk-list { display: grid; gap: 6px; }
    .disk {
      display: grid;
      grid-template-columns: 1fr auto auto auto 80px;
      gap: 12px;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
    }
    .disk:last-child { border-bottom: none; }
    .name { color: var(--text-primary); font-weight: 500; }
    .state { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .temp, .smart { font-variant-numeric: tabular-nums; font-size: 12px; }
    .util { position: relative; height: 4px; background: var(--bg-base); border-radius: 4px; overflow: hidden; }
    .util > span {
      display: block; height: 100%; background: var(--accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
  `;

  @property({ type: Object }) state: ArrayState = {
    kind: 'array', status: 'unknown', usedTB: null, totalTB: null, disks: [],
  };

  render() {
    const { usedTB, totalTB, disks } = this.state;
    const meta = usedTB !== null && totalTB !== null
      ? `${usedTB.toFixed(1)} TB / ${totalTB.toFixed(0)} TB`
      : `${disks.length} disks`;

    return html`
      <md-card cardTitle="Array" meta=${meta}>
        <div class="leds">
          ${disks.map((d) => html`<div class="led" style="background: ${stateColor(d.state)}"></div>`)}
        </div>
        <div class="disk-list">
          ${disks.map((d) => html`
            <div class="disk">
              <span class="name">${d.name}</span>
              <span class="state">
                <span class="dot" style="background: ${stateColor(d.state)}"></span>${d.state}
              </span>
              <span class="temp">${d.tempC !== null ? `${d.tempC} °C` : '—'}</span>
              <span class="smart" style="color: ${smartColor(d.smart)}">${smartIcon(d.smart)}</span>
              <div class="util">
                ${d.utilizationPct !== null ? html`<span style="width: ${d.utilizationPct}%"></span>` : ''}
              </div>
            </div>
          `)}
        </div>
      </md-card>
    `;
  }
}
