import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MemoryState } from '../types';
import './md-card';

@customElement('md-memory-card')
export class MdMemoryCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .pies {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
      padding: 4px 0;
    }
    .pie-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      text-align: center;
    }
    .pie {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pie::after {
      content: "";
      position: absolute;
      inset: 6px;
      background: var(--bg-surface);
      border-radius: 50%;
    }
    .pie .pct {
      position: relative;
      z-index: 1;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .label {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .totals {
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .totals .used { color: var(--text-primary); font-weight: 500; }
  `;

  @property({ type: Object }) state: MemoryState = { kind: 'system', pies: [] };

  render() {
    return html`
      <md-card cardTitle="Memory" meta="${this.state.pies.length} volume${this.state.pies.length === 1 ? '' : 's'}">
        <div class="pies">
          ${this.state.pies.map((p) => {
            const deg = Math.min(360, (p.percentUsed / 100) * 360);
            const gradient = `conic-gradient(var(--mui-accent) 0 ${deg}deg, var(--bg-elevated) ${deg}deg 360deg)`;
            const showTotals = p.used || p.total;
            return html`
              <div class="pie-wrap" title="${p.detail}">
                <div class="pie" style="background: ${gradient}">
                  <span class="pct">${p.percentUsed.toFixed(0)}%</span>
                </div>
                <div class="label">${p.label}</div>
                ${showTotals
                  ? html`<div class="totals"><span class="used">${p.used || '—'}</span>${p.total ? html` / ${p.total}` : ''}</div>`
                  : ''}
              </div>
            `;
          })}
        </div>
      </md-card>
    `;
  }
}
