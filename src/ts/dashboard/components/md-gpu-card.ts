import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { GpuState } from '../types';
import './md-card';
import './md-sparkline';

@customElement('md-gpu-card')
export class MdGpuCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .head {
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
      margin-bottom: 12px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat .label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat .val {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .bar {
      height: 4px;
      background: var(--bg-base);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    .bar > span {
      display: block;
      height: 100%;
      background: var(--mui-accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
    .footer {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
      padding-top: 12px;
      border-top: 1px solid var(--border-subtle);
    }
  `;

  @property({ type: Object }) state: GpuState = {
    kind: 'gpu', model: '', vendor: '', driver: '', pciBus: '',
    utilizationPct: null, memoryUsedPct: null, memoryMHz: null,
    fanRpm: null, powerW: null, temperatureC: null,
    activeApps: 0, throttling: false,
  };

  @state() private _history: number[] = [];

  updated(_c: PropertyValues): void {
    if (this.state.utilizationPct === null) return;
    const last = this._history[this._history.length - 1];
    if (last !== this.state.utilizationPct) {
      this._history = [...this._history, this.state.utilizationPct].slice(-60);
    }
  }

  render() {
    const s = this.state;
    const meta = s.model || `${s.vendor || 'GPU'}`;
    return html`
      <md-card cardTitle="GPU" meta=${meta}>
        <div class="head">
          ${s.driver ? html`Driver: ${s.driver}` : ''}
          ${s.driver && s.pciBus ? html` · ` : ''}
          ${s.pciBus ? html`PCI: ${s.pciBus}` : ''}
        </div>
        <div class="grid">
          <div class="stat">
            <span class="label">Utilization</span>
            <span class="val">${s.utilizationPct ?? '—'}${s.utilizationPct !== null ? '%' : ''}</span>
            ${s.utilizationPct !== null ? html`<div class="bar"><span style="width: ${s.utilizationPct}%"></span></div>` : ''}
          </div>
          <div class="stat">
            <span class="label">Memory</span>
            <span class="val">${s.memoryUsedPct ?? '—'}${s.memoryUsedPct !== null ? '%' : ''}</span>
            ${s.memoryUsedPct !== null ? html`<div class="bar"><span style="width: ${s.memoryUsedPct}%"></span></div>` : ''}
          </div>
          <div class="stat">
            <span class="label">Temperature</span>
            <span class="val">${s.temperatureC !== null ? `${s.temperatureC} °C` : '—'}</span>
          </div>
          <div class="stat">
            <span class="label">Power</span>
            <span class="val">${s.powerW !== null ? `${s.powerW} W` : '—'}</span>
          </div>
        </div>
        <md-sparkline .values=${this._history} max="100"></md-sparkline>
        <div class="footer">
          <span>${s.fanRpm !== null ? `Fan ${s.fanRpm} RPM` : ''}</span>
          <span>${s.activeApps > 0 ? `${s.activeApps} app${s.activeApps === 1 ? '' : 's'}` : 'No active apps'} ${s.throttling ? '· Throttling' : ''}</span>
        </div>
      </md-card>
    `;
  }
}
