import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ProcessorState, MemoryState } from '../types';
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
      margin-bottom: 8px;
    }
    .stats .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
      /* Reserve room for "100%" so the model text beside us doesn't shift
         as the percent toggles between 1, 10, 100 digits. */
      min-width: 4ch;
      text-align: right;
    }
    .stats .small {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .overall-bar {
      height: 6px;
      background: var(--border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: 12px;
    }
    .overall-bar > span {
      display: block;
      height: 100%;
      background: var(--mui-accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
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
      background: var(--border-default);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar > span {
      display: block;
      height: 100%;
      background: var(--mui-accent);
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

    /* Memory section, rendered when a MemoryState companion is supplied. */
    .memory-section {
      margin-top: 16px;
      border-top: 1px solid var(--border-subtle);
      padding-top: 12px;
    }
    .memory-label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin: 0 0 8px;
    }
    .pies {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: 12px;
    }
    .pie-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text-secondary);
      text-align: center;
    }
    .pie {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pie::after {
      content: "";
      position: absolute;
      inset: 5px;
      background: var(--bg-surface);
      border-radius: 50%;
    }
    .pie .pct {
      position: relative;
      z-index: 1;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .pie-label {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

  // Optional companion state; when provided, the card adds a "Memory" section
  // below the sparkline so the user has one consolidated compute card instead
  // of a Processor card + a Memory card side-by-side.
  @property({ type: Object }) memoryState: MemoryState | null = null;

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
    const m = this.memoryState;
    const ramPie = m?.pies.find((p) => /ram/i.test(p.label));
    const meta = [
      s.cores > 0 ? `${s.cores} cores` : null,
      s.temperatureC !== null ? `${s.temperatureC} °C` : null,
      s.totalPowerW !== null ? `${s.totalPowerW} W` : null,
      ramPie ? `RAM ${Math.round(ramPie.percentUsed)}%` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const cardTitle = m ? 'Processor & Memory' : 'Processor';

    return html`
      <md-card cardTitle="${cardTitle}" meta=${meta}>
        <div class="stats">
          <span class="big">${Math.round(s.overallLoadPct ?? 0)}%</span>
          <span class="small">load · ${s.model || 'Unknown CPU'}</span>
        </div>
        <div class="overall-bar"><span style="width: ${s.overallLoadPct ?? 0}%"></span></div>
        <div class="cores">
          ${s.coreLoads.map(
            (c) => html`
              <div class="core">
                <span>${c.threadLabel}</span>
                <div class="bar"><span style="width: ${c.loadPct}%"></span></div>
                <span class="pct">${Math.round(c.loadPct)}%</span>
              </div>
            `,
          )}
        </div>
        <div class="sparkline-wrap">
          <md-sparkline .values=${this._history} max="100"></md-sparkline>
        </div>
        ${m && m.pies.length > 0 ? html`
          <div class="memory-section">
            <div class="memory-label">Memory</div>
            <div class="pies">
              ${m.pies.map((p) => {
                const deg = Math.min(360, (p.percentUsed / 100) * 360);
                const gradient = `conic-gradient(var(--mui-accent) 0 ${deg}deg, var(--bg-elevated) ${deg}deg 360deg)`;
                return html`
                  <div class="pie-wrap" title="${p.detail}">
                    <div class="pie" style="background: ${gradient}">
                      <span class="pct">${p.percentUsed.toFixed(0)}%</span>
                    </div>
                    <div class="pie-label">${p.label}</div>
                  </div>
                `;
              })}
            </div>
          </div>
        ` : ''}
      </md-card>
    `;
  }
}
