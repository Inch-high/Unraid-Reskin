import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { CacheState } from '../types';
import { stateColor, smartIcon, smartColor } from './md-array-card';
import './md-card';

function formatSize(gb: number): string {
  return gb < 1024 ? `${gb.toFixed(0)} GB` : `${(gb / 1024).toFixed(1)} TB`;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

@customElement('md-cache-card')
export class MdCacheCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .leds { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 16px; }
    .led { width: 14px; height: 18px; border-radius: 2px; background: var(--text-muted); }
    .disk-list { display: grid; gap: 6px; }
    .disk {
      display: grid;
      grid-template-columns: 1fr auto auto auto 80px 36px;
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
    .temp, .smart, .pct { font-variant-numeric: tabular-nums; font-size: 12px; }
    .pct { color: var(--text-secondary); text-align: right; }
    .pct.empty { color: var(--text-muted); }
    .util { position: relative; height: 4px; background: var(--border-default); border-radius: 4px; overflow: hidden; }
    .util > span {
      display: block; height: 100%; background: var(--mui-accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
  `;

  @property({ type: Object }) state: CacheState = {
    kind: 'cache', poolName: 'cache', status: 'unknown', usedGB: null, totalGB: null, disks: [],
  };

  render() {
    const { poolName, usedGB, totalGB, disks } = this.state;
    const meta = usedGB !== null && totalGB !== null
      ? `${formatSize(usedGB)} / ${formatSize(totalGB)}`
      : `${disks.length} disks`;

    return html`
      <md-card cardTitle=${capitalise(poolName)} meta=${meta}>
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
              <span class="pct ${d.utilizationPct === null ? 'empty' : ''}">${d.utilizationPct !== null ? `${Math.round(d.utilizationPct)}%` : '—'}</span>
            </div>
          `)}
        </div>
      </md-card>
    `;
  }
}
