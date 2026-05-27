import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DockerContainerFull, DockerFolder, DockerTag } from '../types';
import { icon, type IconName } from '../icons';
import { formatBytes, formatPercent } from '../format';
import './md-docker-row';

@customElement('md-docker-folder-section')
export class MdDockerFolderSection extends LitElement {
  static styles = css`
    :host { display: block; margin-bottom: 12px; }
    .head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
    }
    :host(:not([collapsed])) .head {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
    .toggle {
      background: transparent; border: 0;
      display: flex; align-items: center; gap: 10px;
      cursor: pointer; color: var(--text-primary); padding: 4px;
      font: inherit;
    }
    .toggle .chev {
      color: var(--text-secondary);
      transition: transform var(--duration-fast, 120ms);
    }
    .folder-icon {
      width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--radius-sm);
    }
    .name { font-weight: 600; font-size: 14px; }
    .meta { color: var(--text-secondary); font-size: 12px; margin-left: 4px; }

    /* "N updates" pill — visible whenever the folder contains containers with
       pending updates, regardless of collapsed state. Without this, a
       collapsed folder hides the per-row update accent and the user would have
       no way to know an update is waiting inside. */
    .updates-pill {
      display: inline-flex; align-items: center; gap: 4px;
      margin-left: 8px;
      padding: 2px 8px;
      font: 600 11px var(--font-sans);
      color: var(--mui-accent);
      background: var(--mui-accent-muted);
      border-radius: var(--radius-full);
    }
    .updates-pill svg { width: 12px; height: 12px; }

    /* Summed stats shown in the folder header — only when the folder is
       collapsed AND showStats=true. Helps users see resource consumption
       per logical group without expanding everything. */
    .sums {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-left: 12px;
      padding-left: 12px;
      border-left: 1px solid var(--border-subtle);
      font-family: ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace;
      font-size: 11px;
      color: var(--text-muted);
    }
    .sums .sum strong {
      color: var(--text-secondary);
      font-weight: 500;
      font-family: var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      margin-right: 4px;
    }

    .actions { display: flex; gap: 4px; }
    .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid transparent;
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--border-default); }

    .rows {
      list-style: none; margin: 0; padding: 0;
      border: 1px solid var(--border-subtle);
      border-top: 0;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
      background: var(--bg-surface);
      overflow: hidden;
    }
    /* Row borders live on the row element itself so they survive shadow boundaries */
    ::slotted(md-docker-row:first-child .row) { border-top: 0; }
  `;

  // null folder = "Ungrouped"
  @property({ type: Object }) folder: DockerFolder | null = null;
  @property({ type: Array }) containers: DockerContainerFull[] = [];
  @property({ type: Array }) allTags: DockerTag[] = [];
  @property({ type: Object }) tagAssignments: Record<string, string[]> = {};
  @property({ type: Object }) selection: Set<string> = new Set();
  // Controlled: parent owns the collapsed state (via store) so it survives
  // re-renders triggered by filter changes. Toggle emits 'docker-toggle-folder'.
  @property({ type: Boolean, reflect: true }) collapsed = false;
  @property({ type: Boolean }) showStats = false;

  private _iconName(): IconName {
    const raw = (this.folder?.icon ?? 'folder') as IconName;
    return raw;
  }

  private _color(): string {
    return this.folder?.color ?? '#6b7280';
  }

  private _toggle(): void {
    this.dispatchEvent(new CustomEvent<{ folderId: string }>('docker-toggle-folder', {
      detail: { folderId: this.folder?.id ?? 'ungrouped' },
      bubbles: true, composed: true,
    }));
  }

  private _editFolder(): void {
    if (!this.folder) return;
    this.dispatchEvent(new CustomEvent('docker-edit-folder', {
      detail: { folderId: this.folder.id },
      bubbles: true, composed: true,
    }));
  }

  private _selectAll(): void {
    this.dispatchEvent(new CustomEvent('docker-select-folder', {
      detail: { folderId: this.folder?.id ?? null, containerNames: this.containers.map((c) => c.name) },
      bubbles: true, composed: true,
    }));
  }

  private _sumStats(): { cpu: number | null; ram: number | null; vdisk: number | null } {
    let cpu = 0, cpuCount = 0;
    let ram = 0, ramCount = 0;
    let vdisk = 0, vdiskCount = 0;
    for (const c of this.containers) {
      if (typeof c.cpuPct === 'number' && Number.isFinite(c.cpuPct)) { cpu += c.cpuPct; cpuCount++; }
      if (typeof c.memBytes === 'number' && Number.isFinite(c.memBytes)) { ram += c.memBytes; ramCount++; }
      if (typeof c.vdiskBytes === 'number' && Number.isFinite(c.vdiskBytes)) { vdisk += c.vdiskBytes; vdiskCount++; }
    }
    return {
      cpu: cpuCount > 0 ? cpu : null,
      ram: ramCount > 0 ? ram : null,
      vdisk: vdiskCount > 0 ? vdisk : null,
    };
  }

  render() {
    const running = this.containers.filter((c) => c.state === 'started').length;
    const total = this.containers.length;
    const updates = this.containers.filter((c) => c.updateAvailable).length;
    const name = this.folder?.name ?? 'Ungrouped';
    const color = this._color();
    const bg = `${color}2e`; // ~18% alpha
    const allSelected = total > 0 && this.containers.every((c) => this.selection.has(c.name));

    // Sums shown only when collapsed + stats — saves the user from expanding
    // each folder just to see "how much is this folder using". Excludes
    // stopped containers from CPU/RAM (their values are null anyway).
    const sums = this.collapsed && this.showStats ? this._sumStats() : null;

    return html`
      <header class="head">
        <button class="toggle" @click=${this._toggle}>
          <span class="chev">${this.collapsed ? icon('chevron_right', 14) : icon('chevron_down', 14)}</span>
          <span class="folder-icon" style="background:${bg};color:${color}">${icon(this._iconName(), 16)}</span>
          <span class="name">${name}</span>
          <span class="meta">${total} container${total === 1 ? '' : 's'} · ${running} running</span>
          ${updates > 0 ? html`
            <span class="updates-pill" title="${updates} container${updates === 1 ? '' : 's'} in this folder ${updates === 1 ? 'has' : 'have'} an update available">
              ${icon('update', 12)} ${updates} update${updates === 1 ? '' : 's'}
            </span>
          ` : nothing}
          ${sums ? html`
            <span class="sums">
              <span class="sum"><strong>CPU</strong>${formatPercent(sums.cpu)}</span>
              <span class="sum"><strong>RAM</strong>${formatBytes(sums.ram)}</span>
              <span class="sum"><strong>VDisk</strong>${formatBytes(sums.vdisk)}</span>
            </span>
          ` : ''}
        </button>
        <div class="actions">
          ${total > 0 ? html`
            <button class="icon-btn" title=${allSelected ? 'Clear selection in folder' : 'Select all in folder'} @click=${this._selectAll}>
              ${icon('layers')}
            </button>
          ` : nothing}
          ${this.folder ? html`
            <button class="icon-btn" title="Edit folder" @click=${this._editFolder}>${icon('edit')}</button>
          ` : nothing}
        </div>
      </header>

      ${!this.collapsed && total > 0 ? html`
        <ul class="rows">
          ${this.containers.map((c) => html`
            <li><md-docker-row
              .container=${c}
              .tags=${this.allTags}
              .assignedTagIds=${this.tagAssignments[c.name] ?? []}
              ?selected=${this.selection.has(c.name)}
              ?showStats=${this.showStats}
            ></md-docker-row></li>
          `)}
        </ul>
      ` : nothing}
    `;
  }
}
