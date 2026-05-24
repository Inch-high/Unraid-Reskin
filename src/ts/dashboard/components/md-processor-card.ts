import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ProcessorState } from '../types';
import './md-card';
import './md-sparkline';

@customElement('md-processor-card')
export class MdProcessorCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .stats {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 12px;
    }
    .stats .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .stats .small {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .cores {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 12px;
      margin-top: 8px;
      font-size: 11px;
    }
    .core {
      display: grid;
      grid-template-columns: 70px 1fr 32px;
      gap: 6px;
      align-items: center;
      color: var(--text-secondary);
    }
    .bar {
      height: 4px;
      background: var(--bg-base);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar > span {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
    .pct {
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .sparkline-wrap {
      margin-top: 12px;
      border-top: 1px solid var(--border-subtle);
      padding-top: 12px;
    }
  `;

  @property({ type: Object }) state: ProcessorState = {
    kind: 'processor',
    model: '',
    cores: 0,
    totalPowerW: null,
    temperatureC: null,
    overallLoadPct: null,
    coreLoads: [],
  };

  @state() private _history: number[] = [];

  updated(_changed: PropertyValues): void {
    if (this.state.overallLoadPct === null) return;
    const last = this._history[this._history.length - 1];
    if (last !== this.state.overallLoadPct) {
      this._history = [...this._history, this.state.overallLoadPct].slice(-60);
    }
  }

  render() {
    const s = this.state;
    const meta = [
      s.cores > 0 ? `${s.cores} cores` : null,
      s.temperatureC !== null ? `${s.temperatureC} °C` : null,
      s.totalPowerW !== null ? `${s.totalPowerW} W` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return html`
      <md-card cardTitle="Processor" meta=${meta}>
        <div class="stats">
          <span class="big">${s.overallLoadPct ?? 0}%</span>
          <span class="small">load · ${s.model || 'Unknown CPU'}</span>
        </div>
        <div class="cores">
          ${s.coreLoads.map(
            (c) => html`
              <div class="core">
                <span>${c.threadLabel}</span>
                <div class="bar"><span style="width: ${c.loadPct}%"></span></div>
                <span class="pct">${c.loadPct}%</span>
              </div>
            `,
          )}
        </div>
        <div class="sparkline-wrap">
          <md-sparkline .values=${this._history} max="100"></md-sparkline>
        </div>
      </md-card>
    `;
  }
}
