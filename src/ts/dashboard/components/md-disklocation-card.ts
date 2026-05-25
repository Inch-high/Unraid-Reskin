import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisklocationState, DiskSlot, DiskSlotColor } from '../types';
import './md-card';

function slotColor(c: DiskSlotColor): string {
  switch (c) {
    case 'green':  return 'var(--success)';
    case 'yellow': return 'var(--warning)';
    case 'red':    return 'var(--danger)';
    case 'blue':   return 'var(--info)';
    default:       return 'var(--bg-elevated)';
  }
}

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
      /* NVMe row is narrower and centered above the HDD row */
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
    .slot {
      /* Landscape bay — wider than tall, like a hot-swap drive viewed from the front */
      aspect-ratio: 7 / 3;
      border-radius: var(--radius-xs);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      position: relative;
    }
    .slot.empty {
      background: var(--bg-elevated);
      color: var(--text-muted);
      border: 1px dashed var(--border-default);
    }
    .row.nvme .slot {
      /* NVMe stick aspect — narrower */
      aspect-ratio: 3 / 1;
      font-size: 11px;
    }
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
    return html`<div
      class="slot ${s.occupied ? '' : 'empty'}"
      style="${s.occupied ? `background: ${slotColor(s.orbColor)}` : ''}"
      title="Slot ${s.label} · ${s.orbColor}"
    >${s.label}</div>`;
  }

  render() {
    const { assignedCount, totalCount, groups } = this.state;
    const meta = `${assignedCount} / ${totalCount} bays`;

    // Convention: the smaller group is the NVMe/SSD row, the larger is the
    // HDD bay row. Sort within each group by position ASC so the visual
    // order matches the physical chassis (HL15Rack: position 1 = leftmost
    // physical bay, which carries label "15"; position 15 = rightmost,
    // carrying label "1"). The user sees bay 1 on the right, bay 15 on the
    // left — matching looking at the case head-on.
    const sortedGroups = groups
      .map((g) => [...g].sort((a, b) => a.position - b.position));
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
