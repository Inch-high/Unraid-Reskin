import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisklocationState, DisklocationGroup, DiskSlot, ArrayState, CacheState, ParityState } from '../types';
import './md-card';
import './md-array-card';
import './md-cache-card';
import './md-parity-card';

@customElement('md-disklocation-card')
export class MdDisklocationCard extends LitElement {
  static styles = css`
    :host { display: block; }
    /* One .row per user-defined group. grid-template-columns is set inline
       per-group from the extracted column count, so a 4×1 NVMe row renders
       as 4 columns and a 15×1 HDD row as 15 columns. Compact groups (≤6
       columns) get a max cell width so single NVMe drives don't span the
       whole card. */
    .row {
      display: grid;
      gap: 6px;
      margin: 0 0 10px;
    }
    .row.compact {
      gap: 4px;
      justify-content: end;
      margin-bottom: 8px;
    }
    .row.compact .slot { font-size: 11px; aspect-ratio: 3 / 1; }
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

  // Compact threshold — groups with this many columns or fewer get the smaller
  // slot aspect ratio (the "NVMe row" look) so a 4-bay NVMe header doesn't
  // span the full card width. Above this, slots use the wider landscape aspect
  // that suits the typical row of 8-16 HDD bays.
  private static readonly COMPACT_COLUMNS_MAX = 6;

  render() {
    const { assignedCount, totalCount, groups } = this.state;
    const meta = `${assignedCount} / ${totalCount} bays`;
    // Render in the order the plugin emitted (= user's vertical order).
    // Each group is sorted by tray position so reordering within a group via
    // the plugin's locations.json is honored. Group NAMES and COLUMN COUNTS
    // are read from the rendered DOM (see disklocation extractor) — we no
    // longer guess "biggest group is HDDs" or label things "NVMe / SSD"
    // when the user named them otherwise.
    const sorted: DisklocationGroup[] = groups.map((g) => ({
      ...g,
      slots: [...g.slots].sort((a, b) => a.position - b.position),
    }));
    const hasDetails = !!this.arrayState || this.cacheStates.length > 0 || !!this.parityState;

    return html`
      <md-card cardTitle="Disk Location" meta=${meta}>
        ${sorted.map((g) => {
          const compact = g.columns <= MdDisklocationCard.COMPACT_COLUMNS_MAX;
          const cols = Math.max(1, g.columns);
          // Wide rows (HDDs etc) fill the card width — each slot gets a 1fr
          // track. Compact rows (NVMe, small SSD groups) cap each slot at
          // 64px so 4 NVMe drives don't span the full card as huge tiles;
          // the row's justify-content: end then anchors them to the right
          // edge for visual symmetry with the wider HDD row below.
          const gridStyle = compact
            ? `grid-template-columns: repeat(${cols}, 64px)`
            : `grid-template-columns: repeat(${cols}, minmax(0, 1fr))`;
          return html`
            <div class="row-label">${g.name || 'Bays'}</div>
            <div class="row ${compact ? 'compact' : ''}" style=${gridStyle}>
              ${g.slots.map((s) => this._renderSlot(s))}
            </div>
          `;
        })}
        ${assignedCount < totalCount ? html`
          <div class="summary">${totalCount - assignedCount} bay${totalCount - assignedCount === 1 ? '' : 's'} empty</div>
        ` : ''}
        ${hasDetails ? html`
          <details class="storage-details" data-hero-expander="storage-details">
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
