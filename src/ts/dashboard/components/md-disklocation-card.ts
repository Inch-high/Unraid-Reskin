import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisklocationState, DiskSlotColor } from '../types';
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
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
      gap: 4px;
      margin: 4px 0 8px;
    }
    .slot {
      aspect-ratio: 5 / 7;
      border-radius: var(--radius-xs);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 2px;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.85);
      font-weight: 600;
      position: relative;
    }
    .slot.empty {
      background: var(--bg-elevated);
      color: var(--text-muted);
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
    slots: [],
  };

  render() {
    const { assignedCount, totalCount, slots } = this.state;
    const meta = `${assignedCount} / ${totalCount} bays`;
    // Sort by position so visual matches physical layout
    const sortedSlots = [...slots].sort((a, b) => a.position - b.position);

    return html`
      <md-card cardTitle="Disk Location" meta=${meta}>
        <div class="grid">
          ${sortedSlots.map(
            (s) => html`<div
              class="slot ${s.occupied ? '' : 'empty'}"
              style="background: ${s.occupied ? slotColor(s.orbColor) : ''}"
              title="Slot ${s.label} · ${s.orbColor}"
            >${s.label}</div>`,
          )}
        </div>
        ${assignedCount < totalCount ? html`
          <div class="summary">${totalCount - assignedCount} bay${totalCount - assignedCount === 1 ? '' : 's'} empty</div>
        ` : ''}
      </md-card>
    `;
  }
}
