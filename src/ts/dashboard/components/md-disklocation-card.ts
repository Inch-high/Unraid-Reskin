import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisklocationState, DiskSlot, ArrayState, CacheState, ParityState } from '../types';
import './md-card';
import './md-array-card';
import './md-cache-card';
import './md-parity-card';

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
      min-height: 12px;
    }
    .status.active  { color: var(--success); }
    .status.standby { color: var(--text-secondary); }
    .status.empty   { color: transparent; }
    .summary {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    /* Collapsible "details" footer that holds the Array / Cache / Parity content */
    details.storage-details {
      margin-top: 16px;
      border-top: 1px solid var(--border-subtle);
      padding-top: 12px;
    }
    details.storage-details summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      user-select: none;
      padding: 4px 0;
    }
    details.storage-details summary::-webkit-details-marker { display: none; }
    .chevron {
      display: inline-block;
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 6px solid var(--text-secondary);
      transition: transform var(--duration-fast) var(--ease-out);
    }
    details.storage-details[open] .chevron {
      transform: rotate(90deg);
    }
    .summary-meta {
      color: var(--text-secondary);
      font-weight: 400;
      font-size: 12px;
      margin-left: auto;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }
  `;

  @property({ type: Object }) state: DisklocationState = {
    kind: 'disklocation',
    assignedCount: 0,
    totalCount: 0,
    groups: [],
  };

  // Optional companion states; when provided, the card surfaces a collapsible
  // "Storage details" footer that holds the Array / Cache / Parity cards so
  // the user has one consolidated storage view instead of four side-by-side cards.
  @property({ type: Object }) arrayState: ArrayState | null = null;
  @property({ type: Array })  cacheStates: CacheState[] = [];
  @property({ type: Object }) parityState: ParityState | null = null;

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

  private _detailsSummary(): string {
    const parts: string[] = [];
    if (this.arrayState) {
      const a = this.arrayState;
      if (a.usedTB !== null && a.totalTB !== null) {
        parts.push(`Array ${a.usedTB.toFixed(1)} / ${a.totalTB.toFixed(0)} TB`);
      } else {
        parts.push(`Array (${a.disks.length} disks)`);
      }
    }
    for (const c of this.cacheStates) {
      if (c.usedGB !== null && c.totalGB !== null) {
        const total = c.totalGB >= 1024
          ? `${(c.totalGB / 1024).toFixed(1)} TB`
          : `${c.totalGB.toFixed(0)} GB`;
        const used = c.usedGB >= 1024
          ? `${(c.usedGB / 1024).toFixed(1)} TB`
          : `${c.usedGB.toFixed(0)} GB`;
        parts.push(`${c.poolName || 'Cache'} ${used} / ${total}`);
      }
    }
    if (this.parityState) {
      const s = this.parityState.status;
      parts.push(`Parity ${s}`);
    }
    return parts.join(' · ');
  }

  render() {
    const { assignedCount, totalCount, groups } = this.state;
    const meta = `${assignedCount} / ${totalCount} bays`;
    const sortedGroups = groups.map((g) => [...g].sort((a, b) => a.position - b.position));
    const hddGroup = sortedGroups.length > 0
      ? sortedGroups.reduce((a, b) => (b.length > a.length ? b : a))
      : [];
    const otherGroups = sortedGroups.filter((g) => g !== hddGroup);
    const hasDetails = !!this.arrayState || this.cacheStates.length > 0 || !!this.parityState;

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
        ${hasDetails ? html`
          <details class="storage-details">
            <summary>
              <span class="chevron"></span>
              Storage details
              <span class="summary-meta">${this._detailsSummary()}</span>
            </summary>
            <div class="details-grid">
              ${this.arrayState ? html`<md-array-card .state=${this.arrayState}></md-array-card>` : ''}
              ${this.cacheStates.map((c) => html`<md-cache-card .state=${c}></md-cache-card>`)}
              ${this.parityState ? html`<md-parity-card .state=${this.parityState}></md-parity-card>` : ''}
            </div>
          </details>
        ` : ''}
      </md-card>
    `;
  }
}
