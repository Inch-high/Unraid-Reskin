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
      background: var(--border-default);
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
    // The `gpu-fan1` class on Unraid stores a 0-100 percent (despite the
    // stock label "Fan (RPM)") — display as percent for clarity.
    const fanPct = s.fanRpm;
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
            <span class="val">${Math.round(s.utilizationPct ?? 0)}%</span>
            <div class="bar"><span style="width: ${s.utilizationPct ?? 0}%"></span></div>
          </div>
          <div class="stat">
            <span class="label">Memory</span>
            <span class="val">${Math.round(s.memoryUsedPct ?? 0)}%</span>
            <div class="bar"><span style="width: ${s.memoryUsedPct ?? 0}%"></span></div>
          </div>
          <div class="stat">
            <span class="label">Fan</span>
            <span class="val">${fanPct !== null ? `${fanPct}%` : '—'}</span>
            ${fanPct !== null ? html`<div class="bar"><span style="width: ${fanPct}%"></span></div>` : ''}
          </div>
          <div class="stat">
            <span class="label">Mem Clock</span>
            <span class="val">${s.memoryMHz !== null ? `${s.memoryMHz} MHz` : '—'}</span>
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
          <span>${s.activeApps > 0 ? `${s.activeApps} app${s.activeApps === 1 ? '' : 's'} active` : 'No active apps'}</span>
          <span>${s.throttling ? 'Throttling' : 'Nominal'}</span>
        </div>
      </md-card>
    `;
  }
}
