import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UpsState, UpsStatus } from '../types';
import './md-card';

function statusPill(s: UpsStatus) {
  const map: Record<UpsStatus, { text: string; color: string }> = {
    'on-line': { text: 'On line', color: 'var(--success)' },
    'on-battery': { text: 'On battery', color: 'var(--warning)' },
    'low-battery': { text: 'Low battery', color: 'var(--danger)' },
    'replace-battery': { text: 'Replace battery', color: 'var(--danger)' },
    unknown: { text: 'Unknown', color: 'var(--text-muted)' },
  };
  const { text, color } = map[s];
  return html`<span style="
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    background: ${color}26; color: ${color};
  ">${text}</span>`;
}

function formatRuntime(mins: number | null): string {
  if (mins === null) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatLoad(state: UpsState): string {
  if (state.loadPct === null) return '—';
  if (state.loadW !== null) return `${state.loadPct}% (${state.loadW} W)`;
  return `${state.loadPct}%`;
}

function formatNominal(state: UpsState): string {
  if (state.nominalPowerW === null && state.nominalVA === null) return '—';
  if (state.nominalPowerW !== null && state.nominalVA !== null) {
    return `${state.nominalPowerW} W (${state.nominalVA} VA)`;
  }
  return state.nominalPowerW !== null ? `${state.nominalPowerW} W` : `${state.nominalVA} VA`;
}

@customElement('md-ups-card')
export class MdUpsCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .layout {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .donut-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .donut {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .donut::after {
      content: "";
      position: absolute;
      inset: 8px;
      background: var(--bg-surface);
      border-radius: 50%;
    }
    .donut .pct {
      position: relative;
      z-index: 1;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .rows {
      flex: 1;
      min-width: 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      gap: 12px;
    }
    .row:last-child { border-bottom: none; }
    .label { color: var(--text-secondary); flex-shrink: 0; }
    .value { color: var(--text-primary); font-weight: 500; text-align: right; }
    .pill-row { margin-bottom: 12px; }
  `;

  @property({ type: Object }) state: UpsState = {
    kind: 'ups',
    status: 'unknown',
    statusText: '',
    batteryChargePct: null,
    loadPct: null,
    loadW: null,
    runtimeMinutes: null,
    nominalPowerW: null,
    nominalVA: null,
  };

  render() {
    const s = this.state;
    const pct = s.batteryChargePct;
    const deg = pct !== null ? Math.min(360, (pct / 100) * 360) : 0;
    const ringColor =
      s.status === 'on-battery' || s.status === 'low-battery' || s.status === 'replace-battery'
        ? 'var(--warning)'
        : 'var(--success)';
    const gradient =
      pct === null
        ? 'conic-gradient(var(--bg-elevated) 0 360deg)'
        : `conic-gradient(${ringColor} 0 ${deg}deg, var(--bg-elevated) ${deg}deg 360deg)`;
    const meta = s.statusText || '—';
    return html`
      <md-card cardTitle="UPS" meta="${meta}">
        <div class="pill-row">${statusPill(s.status)}</div>
        <div class="layout">
          <div class="donut-wrap">
            <div class="donut" style="background: ${gradient}">
              <span class="pct">${pct !== null ? `${pct.toFixed(0)}%` : '—'}</span>
            </div>
            <div>Battery</div>
          </div>
          <div class="rows">
            <div class="row"><span class="label">Status</span><span class="value">${s.statusText || '—'}</span></div>
            <div class="row"><span class="label">Runtime</span><span class="value">${formatRuntime(s.runtimeMinutes)}</span></div>
            <div class="row"><span class="label">Load</span><span class="value">${formatLoad(s)}</span></div>
            <div class="row"><span class="label">Nominal</span><span class="value">${formatNominal(s)}</span></div>
          </div>
        </div>
      </md-card>
    `;
  }
}
