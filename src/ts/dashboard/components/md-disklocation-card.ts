import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisklocationState, DiskSlot } from '../types';
import './md-card';

@customElement('md-disklocation-card')
export class MdDisklocationCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .row {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 6px;
      margin: 0 0 10px;
    }
    .row.nvme {
      grid-auto-columns: minmax(0, 60px);
      justify-content: end;
      gap: 4px;
      margin-bottom: 8px;
    }
    .row-label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin: 0 0 4px;
    }
    .slot-wrap {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
    }
    .slot {
      /* Landscape bay — wider than tall, like a hot-swap drive viewed from the front */
      aspect-ratio: 7 / 3;
      border-radius: var(--radius-xs);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      position: relative;
    }
    .slot.active {
      background: var(--success);
      color: rgba(255, 255, 255, 0.95);
    }
    .slot.standby {
      background: var(--bg-elevated);
      border: 1px solid var(--success);
      color: var(--success);
    }
    .slot.empty {
      background: var(--bg-elevated);
      border: 1px dashed var(--border-default);
      color: var(--text-muted);
    }
    .row.nvme .slot {
      aspect-ratio: 3 / 1;
      font-size: 11px;
    }
    .status {
      font-size: 10px;
      text-align: center;
      letter-spacing: 0.02em;
      min-height: 12px; /* reserve space so empty bays don't collapse the row */
    }
    .status.active  { color: var(--success); }
    .status.standby { color: var(--text-secondary); }
    .status.empty   { color: transparent; }
    .summary {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }
  `;

  @property({ type: Object }) state: DisklocationState = {
    kind: 'disklocation',
    assignedCount: 0,
    totalCount: 0,
    groups: [],
  };

  private _renderSlot(s: DiskSlot) {
    const statusText = s.state === 'active' ? 'active'
                     : s.state === 'standby' ? 'spun down'
                     : '';
    const title = s.diskName
      ? `${s.diskName} · slot ${s.label} · ${s.state}`
      : `Slot ${s.label} · ${s.state}`;
    return html`
      <div class="slot-wrap">
        <div class="slot ${s.state}" title="${title}">${s.label}</div>
        <div class="status ${s.state}">${statusText}</div>
      </div>
    `;
  }

  render() {
    const { assignedCount, totalCount, groups } = this.state;
    const meta = `${assignedCount} / ${totalCount} bays`;
    const sortedGroups = groups.map((g) => [...g].sort((a, b) => a.position - b.position));
    const hddGroup = sortedGroups.length > 0
      ? sortedGroups.reduce((a, b) => (b.length > a.length ? b : a))
      : [];
    const otherGroups = sortedGroups.filter((g) => g !== hddGroup);

    return html`
      <md-card cardTitle="Disk Location" meta=${meta}>
        ${otherGroups.map((g) => html`
          <div class="row-label">NVMe / SSD</div>
          <div class="row nvme">${g.map((s) => this._renderSlot(s))}</div>
        `)}
        ${hddGroup.length > 0 ? html`
          <div class="row-label">Drive Bays</div>
          <div class="row">${hddGroup.map((s) => this._renderSlot(s))}</div>
        ` : ''}
        ${assignedCount < totalCount ? html`
          <div class="summary">${totalCount - assignedCount} bay${totalCount - assignedCount === 1 ? '' : 's'} empty</div>
        ` : ''}
      </md-card>
    `;
  }
}
