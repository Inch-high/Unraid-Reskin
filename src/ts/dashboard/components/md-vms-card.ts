import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { VmsState, VmRow } from '../types';
import './md-card';

function statusPill(s: VmRow['state']) {
  const map: Record<VmRow['state'], { text: string; color: string }> = {
    started: { text: 'Started', color: 'var(--success)' },
    stopped: { text: 'Stopped', color: 'var(--danger)' },
    paused: { text: 'Paused', color: 'var(--warning)' },
    unknown: { text: 'Unknown', color: 'var(--text-muted)' },
  };
  const { text, color } = map[s];
  return html`<span style="
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    background: ${color}26; color: ${color};
  ">${text}</span>`;
}

@customElement('md-vms-card')
export class MdVmsCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .empty {
      color: var(--text-muted);
      font-size: 13px;
    }
    .vm-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .vm-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-size: 13px;
      color: var(--text-primary);
      transition: border-color 120ms cubic-bezier(0.2, 0, 0, 1);
    }
    .vm-row:hover { border-color: var(--mui-accent); }
    .vm-row img,
    .vm-row .icon-fallback {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-xs);
      flex-shrink: 0;
    }
    .vm-row .icon-fallback {
      background: var(--bg-elevated);
    }
    .vm-row .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  @property({ type: Object }) state: VmsState = {
    kind: 'vms',
    vms: [],
    totalRunning: 0,
    totalCount: 0,
  };

  private _renderRow(v: VmRow) {
    return html`
      <div class="vm-row">
        ${
          v.iconUrl
            ? html`<img src="${v.iconUrl}" alt="">`
            : html`<span class="icon-fallback"></span>`
        }
        <span class="name">${v.name}</span>
        ${statusPill(v.state)}
      </div>
    `;
  }

  render() {
    const { vms, totalRunning, totalCount } = this.state;
    const meta = totalCount === 0 ? '' : `${totalRunning} / ${totalCount} running`;
    return html`
      <md-card cardTitle="Virtual Machines" meta=${meta}>
        ${
          vms.length === 0
            ? html`<div class="empty">No VMs configured</div>`
            : html`<div class="vm-list">${vms.map((v) => this._renderRow(v))}</div>`
        }
      </md-card>
    `;
  }
}
