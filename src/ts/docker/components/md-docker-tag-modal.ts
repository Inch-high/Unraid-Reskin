import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DockerContainerFull, DockerTag } from '../types';
import { icon } from '../icons';

const COLOR_SWATCHES = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#a78bfa', '#14b8a6', '#ec4899', '#6b7280',
];

@customElement('md-docker-tag-modal')
export class MdDockerTagModal extends LitElement {
  static styles = css`
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: grid; place-items: center;
      z-index: 100;
    }
    .modal {
      width: min(960px, 92vw);
      max-height: 88vh;
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,.5);
    }
    .head { padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; }
    .head h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .head p { margin: 0; color: var(--text-secondary); font-size: 12px; }
    .head .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid transparent;
      color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer;
    }
    .head .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

    .body { display: grid; grid-template-columns: 280px 1fr; min-height: 0; flex: 1; }
    /* Mobile: stack aside above editor, same treatment as the folder modal —
       the two-pane layout compresses both panes uselessly under ~720px. */
    @media (max-width: 720px) {
      .body {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(140px, 35vh) 1fr;
      }
      .aside { border-right: 0 !important; border-bottom: 1px solid var(--border-subtle); }
    }
    .aside {
      border-right: 1px solid var(--border-subtle);
      display: flex; flex-direction: column;
      background: var(--bg-base);
      overflow-y: auto;
    }
    .aside h3 {
      font: 600 10px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      padding: 14px 16px 6px;
      margin: 0;
    }
    .aside-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; margin: 2px 8px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .aside-row:hover { background: var(--bg-elevated); }
    .aside-row[data-active] { background: var(--mui-accent-muted); color: var(--mui-accent); }
    .swatch {
      width: 24px; height: 24px; border-radius: var(--radius-sm);
      display: inline-flex; align-items: center; justify-content: center;
    }
    .tag-chip {
      display: inline-flex; align-items: center;
      font: 600 10px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border-radius: var(--radius-full);
    }
    .count { color: var(--text-muted); font-size: 12px; margin-left: auto; font-variant-numeric: tabular-nums; }
    .aside-add {
      margin: 8px 12px 12px 12px;
      display: flex; align-items: center; gap: 6px;
      padding: 8px 10px;
      background: transparent;
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      font: 500 12px var(--font-sans);
      justify-content: center;
    }
    .aside-add:hover { color: var(--mui-accent); border-color: var(--mui-accent); }

    .main { padding: 20px; overflow-y: auto; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font: 600 11px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .field input[type="text"] {
      width: 100%;
      height: 36px;
      padding: 0 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font: inherit;
      box-sizing: border-box;
    }
    .field input[type="text"]:focus { outline: 0; border-color: var(--mui-accent); box-shadow: 0 0 0 3px var(--mui-accent-muted); }

    .swatch-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .swatch-pick {
      width: 28px; height: 28px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 2px solid transparent;
    }
    .swatch-pick[data-selected] { border-color: var(--text-primary); transform: scale(1.08); }

    .search {
      display: flex; align-items: center; gap: 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      margin-bottom: 10px;
    }
    .search svg { color: var(--text-muted); }
    .search input { background: transparent; border: 0; outline: 0; color: var(--text-primary); font: inherit; flex: 1; }
    .search input::placeholder { color: var(--text-muted); }

    .table {
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      background: var(--bg-base);
      overflow: hidden;
    }
    .trow {
      display: grid; grid-template-columns: 28px 1fr 2fr;
      gap: 12px; align-items: center;
      padding: 10px 14px;
      border-top: 1px solid var(--border-subtle);
    }
    .trow:first-child { border-top: 0; }
    .trow input[type="checkbox"] {
      appearance: none; width: 16px; height: 16px;
      border: 1.5px solid var(--border-default); border-radius: var(--radius-xs);
      background: var(--bg-base); cursor: pointer; position: relative; margin: 0;
    }
    .trow input[type="checkbox"]:checked { background: var(--mui-accent); border-color: var(--mui-accent); }
    .trow input[type="checkbox"]:checked::after {
      content: ""; position: absolute; left: 4px; top: 1px;
      width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .ct-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mini-icon {
      width: 24px; height: 24px; border-radius: var(--radius-xs);
      background: var(--bg-elevated);
      display: inline-flex; align-items: center; justify-content: center;
      overflow: hidden; flex-shrink: 0;
    }
    .mini-icon img { width: 100%; height: 100%; object-fit: contain; padding: 2px; box-sizing: border-box; }
    .ct-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tags-cell { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }

    .foot {
      padding: 12px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .foot .right { display: flex; gap: 8px; }
    .hint { color: var(--text-muted); font-size: 12px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      font: 500 13px var(--font-sans);
      cursor: pointer;
    }
    .btn-primary { background: var(--mui-accent); color: #fff; }
    .btn-primary:hover { background: var(--mui-accent-hover); }
    .btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-default); }
    .btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .btn-ghost.danger { color: var(--danger); }
  `;

  @property({ type: Array }) tags: DockerTag[] = [];
  @property({ type: Object }) assignments: Record<string, string[]> = {};
  @property({ type: Array }) containers: DockerContainerFull[] = [];

  @state() private _draftTags: DockerTag[] = [];
  @state() private _draftAssign: Record<string, string[]> = {};
  @state() private _activeId: string | null = null;
  @state() private _filter = '';

  connectedCallback(): void {
    super.connectedCallback();
    this._draftTags = this.tags.map((t) => ({ ...t }));
    this._draftAssign = Object.fromEntries(Object.entries(this.assignments).map(([k, v]) => [k, [...v]]));
    this._activeId = this._draftTags[0]?.id ?? null;
  }

  private _active(): DockerTag | null {
    return this._draftTags.find((t) => t.id === this._activeId) ?? null;
  }

  private _updateActive(patch: Partial<DockerTag>): void {
    if (!this._activeId) return;
    this._draftTags = this._draftTags.map((t) => t.id === this._activeId ? { ...t, ...patch } : t);
  }

  private _addTag(): void {
    const id = 't-' + Math.random().toString(36).slice(2, 10);
    const t: DockerTag = { id, name: 'new-tag', color: '#22c55e' };
    this._draftTags = [...this._draftTags, t];
    this._activeId = id;
  }

  private _deleteActive(): void {
    if (!this._activeId) return;
    const assignedCount = Object.values(this._draftAssign).filter((ids) => ids.includes(this._activeId!)).length;
    const msg = assignedCount > 0
      ? `Delete this tag? It will be removed from ${assignedCount} container${assignedCount === 1 ? '' : 's'}.`
      : 'Delete this tag?';
    if (!confirm(msg)) return;
    const id = this._activeId;
    this._draftTags = this._draftTags.filter((t) => t.id !== id);
    this._draftAssign = Object.fromEntries(
      Object.entries(this._draftAssign).map(([k, v]) => [k, v.filter((tid) => tid !== id)]),
    );
    this._activeId = this._draftTags[0]?.id ?? null;
  }

  private _toggleAssignment(containerName: string): void {
    if (!this._activeId) return;
    const cur = this._draftAssign[containerName] ?? [];
    const has = cur.includes(this._activeId);
    const next = has ? cur.filter((id) => id !== this._activeId) : [...cur, this._activeId];
    this._draftAssign = { ...this._draftAssign, [containerName]: next };
  }

  private _save(): void {
    // Clean up empty arrays to keep the JSON tidy.
    const cleanedAssign: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(this._draftAssign)) {
      if (v.length > 0) cleanedAssign[k] = v;
    }
    this.dispatchEvent(new CustomEvent<{ tags: DockerTag[]; assignments: Record<string, string[]> }>('docker-save-tags', {
      detail: { tags: this._draftTags, assignments: cleanedAssign },
      bubbles: true, composed: true,
    }));
  }

  private _close(): void {
    // Cancel/X discards unsaved changes silently. See md-docker-folder-modal._close.
    this.dispatchEvent(new CustomEvent('docker-modal-close', { bubbles: true, composed: true }));
  }

  private _renderChip(tag: DockerTag) {
    return html`<span class="tag-chip" style="background:${hexToRgba(tag.color, 0.15)};color:${tag.color}">${tag.name}</span>`;
  }

  render() {
    const active = this._active();
    const q = this._filter.trim().toLowerCase();
    const visibleContainers = q
      ? this.containers.filter((c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q))
      : this.containers;
    const tagCount = (id: string): number => Object.values(this._draftAssign).filter((ids) => ids.includes(id)).length;

    return html`
      <div class="backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal" role="dialog" aria-modal="true">

          <header class="head">
            <div>
              <h2>Manage Docker Tags</h2>
              <p>Tags are cross-cutting · a container can carry many</p>
            </div>
            <button class="icon-btn" @click=${this._close}>${icon('x')}</button>
          </header>

          <div class="body">
            <aside class="aside">
              <h3>Tags · ${this._draftTags.length}</h3>
              ${this._draftTags.map((t) => html`
                <div class="aside-row" ?data-active=${t.id === this._activeId} @click=${() => { this._activeId = t.id; }}>
                  <span class="swatch" style="background:${hexToRgba(t.color, 0.18)};color:${t.color}">${icon('tag', 14)}</span>
                  <span class="tag-chip" style="background:${hexToRgba(t.color, 0.15)};color:${t.color}">${t.name}</span>
                  <span class="count">${tagCount(t.id)}</span>
                </div>
              `)}
              <button class="aside-add" @click=${this._addTag}>${icon('plus', 12)} New tag</button>
            </aside>

            <div class="main">
              ${active ? html`
                <div class="row2">
                  <div class="field">
                    <label>Tag name</label>
                    <input type="text" .value=${active.name}
                           @input=${(e: Event) => this._updateActive({ name: (e.target as HTMLInputElement).value })}>
                  </div>
                  <div class="field">
                    <label>Color</label>
                    <div class="swatch-row">
                      ${COLOR_SWATCHES.map((c) => html`
                        <span class="swatch-pick" style="background:${c}"
                              ?data-selected=${active.color === c}
                              @click=${() => this._updateActive({ color: c })}></span>
                      `)}
                    </div>
                  </div>
                </div>

                <div class="field">
                  <label>Assignments · ${tagCount(active.id)} container${tagCount(active.id) === 1 ? '' : 's'} carry ${this._renderChip(active)}</label>
                  <label class="search">
                    ${icon('search', 14)}
                    <input type="text" placeholder="Filter containers..."
                           .value=${this._filter}
                           @input=${(e: Event) => { this._filter = (e.target as HTMLInputElement).value; }}>
                  </label>
                  <div class="table">
                    ${visibleContainers.map((c) => {
                      const ids = this._draftAssign[c.name] ?? [];
                      const checked = ids.includes(active.id);
                      return html`
                        <div class="trow">
                          <input type="checkbox" .checked=${checked} @change=${() => this._toggleAssignment(c.name)}>
                          <div class="ct-cell">
                            <span class="mini-icon">${c.iconUrl ? html`<img src=${c.iconUrl}>` : (c.name[0] ?? '?').toUpperCase()}</span>
                            <span class="ct-name">${c.name}</span>
                          </div>
                          <div class="tags-cell">
                            ${ids.length === 0
                              ? html`<span class="hint">— no tags —</span>`
                              : ids.map((tid) => {
                                  const t = this._draftTags.find((x) => x.id === tid);
                                  return t ? this._renderChip(t) : nothing;
                                })}
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                </div>
              ` : html`<p class="hint">No tag selected. Click "New tag" to create one.</p>`}
            </div>
          </div>

          <footer class="foot">
            <span class="hint">Tag changes apply instantly when you save</span>
            <div class="right">
              ${active ? html`<button class="btn btn-ghost danger" @click=${this._deleteActive}>Delete tag</button>` : nothing}
              <button class="btn btn-ghost" @click=${this._close}>Cancel</button>
              <button class="btn btn-primary" @click=${this._save}>Save</button>
            </div>
          </footer>

        </div>
      </div>
    `;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,140,47,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}
